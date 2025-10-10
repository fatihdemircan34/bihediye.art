import * as admin from 'firebase-admin';
import { Order } from '../models/order.model';
import { ConversationState } from './order.service';
import { DiscountCode, DiscountUsage } from '../models/discount.model';
import { GA4Service } from './ga4.service';
import { config } from '../config/config';

export class FirebaseService {
  private db: admin.firestore.Firestore;
  private storage: admin.storage.Storage;
  private bucket: any;
  private ga4?: GA4Service;

  // Collection names with bihediye_ prefix
  private readonly COLLECTIONS = {
    ORDERS: 'bihediye_orders',
    CONVERSATIONS: 'bihediye_conversations',
    USERS: 'bihediye_users',
    ANALYTICS: 'bihediye_analytics',
    DISCOUNTS: 'bihediye_discounts',
    DISCOUNT_USAGES: 'bihediye_discount_usages',
  };

  constructor(serviceAccountPath?: string) {
    try {
      // Initialize Firebase Admin
      if (serviceAccountPath) {
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          storageBucket: 'voiceprocess-58fbc.firebasestorage.app',
        });
      } else {
        // Use default credentials or environment variable
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          storageBucket: 'voiceprocess-58fbc.firebasestorage.app',
        });
      }

      this.db = admin.firestore();
      this.storage = admin.storage();
      this.bucket = this.storage.bucket();
      console.log('✅ Firebase initialized successfully');
      console.log('✅ Firebase Storage bucket:', this.bucket.name);

      // Initialize GA4 if credentials are provided
      if (config.ga4.measurementId && config.ga4.apiSecret) {
        this.ga4 = new GA4Service(config.ga4.measurementId, config.ga4.apiSecret);
        console.log('✅ GA4 Analytics initialized');
      } else {
        console.log('⚠️  GA4 Analytics not configured (optional)');
      }
    } catch (error: any) {
      console.error('❌ Firebase initialization error:', error.message);
      throw error;
    }
  }

  /**
   * ORDERS COLLECTION
   */

  async saveOrder(order: Order): Promise<void> {
    try {
      await this.db.collection(this.COLLECTIONS.ORDERS).doc(order.id).set({
        ...order,
        createdAt: admin.firestore.Timestamp.fromDate(order.createdAt),
        completedAt: order.completedAt
          ? admin.firestore.Timestamp.fromDate(order.completedAt)
          : null,
        estimatedDelivery: order.estimatedDelivery
          ? admin.firestore.Timestamp.fromDate(order.estimatedDelivery)
          : null,
      });
    } catch (error) {
      console.error('Error saving order:', error);
      throw error;
    }
  }

  async getOrder(orderId: string): Promise<Order | null> {
    try {
      const doc = await this.db.collection(this.COLLECTIONS.ORDERS).doc(orderId).get();

      if (!doc.exists) {
        return null;
      }

      const data = doc.data()!;
      return {
        ...data,
        createdAt: data.createdAt?.toDate(),
        completedAt: data.completedAt?.toDate(),
        estimatedDelivery: data.estimatedDelivery?.toDate(),
      } as Order;
    } catch (error) {
      console.error('Error getting order:', error);
      throw error;
    }
  }

  async updateOrder(orderId: string, updates: Partial<Order>): Promise<void> {
    try {
      const updateData: any = { ...updates };

      // Convert dates to Firestore Timestamps
      if (updates.completedAt) {
        updateData.completedAt = admin.firestore.Timestamp.fromDate(updates.completedAt);
      }
      if (updates.estimatedDelivery) {
        updateData.estimatedDelivery = admin.firestore.Timestamp.fromDate(updates.estimatedDelivery);
      }

      await this.db.collection(this.COLLECTIONS.ORDERS).doc(orderId).update(updateData);
    } catch (error) {
      console.error('Error updating order:', error);
      throw error;
    }
  }

  async getAllOrders(limit: number = 100): Promise<Order[]> {
    try {
      const snapshot = await this.db
        .collection(this.COLLECTIONS.ORDERS)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          createdAt: data.createdAt?.toDate(),
          completedAt: data.completedAt?.toDate(),
          estimatedDelivery: data.estimatedDelivery?.toDate(),
        } as Order;
      });
    } catch (error) {
      console.error('Error getting all orders:', error);
      throw error;
    }
  }

  async getOrdersByPhone(phone: string, limit: number = 10): Promise<Order[]> {
    try {
      const snapshot = await this.db
        .collection(this.COLLECTIONS.ORDERS)
        .where('whatsappPhone', '==', phone)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          createdAt: data.createdAt?.toDate(),
          completedAt: data.completedAt?.toDate(),
          estimatedDelivery: data.estimatedDelivery?.toDate(),
        } as Order;
      });
    } catch (error) {
      console.error('Error getting orders by phone:', error);
      throw error;
    }
  }

  /**
   * CONVERSATIONS COLLECTION
   */

  async saveConversation(conversation: ConversationState): Promise<void> {
    try {
      await this.db
        .collection(this.COLLECTIONS.CONVERSATIONS)
        .doc(conversation.phone)
        .set({
          ...conversation,
          lastUpdated: admin.firestore.Timestamp.fromDate(conversation.lastUpdated),
        });
    } catch (error) {
      console.error('Error saving conversation:', error);
      throw error;
    }
  }

  async getConversation(phone: string): Promise<ConversationState | null> {
    try {
      const doc = await this.db.collection(this.COLLECTIONS.CONVERSATIONS).doc(phone).get();

      if (!doc.exists) {
        return null;
      }

      const data = doc.data()!;
      return {
        ...data,
        lastUpdated: data.lastUpdated?.toDate(),
      } as ConversationState;
    } catch (error) {
      console.error('Error getting conversation:', error);
      throw error;
    }
  }

  async deleteConversation(phone: string): Promise<void> {
    try {
      await this.db.collection(this.COLLECTIONS.CONVERSATIONS).doc(phone).delete();
    } catch (error) {
      console.error('Error deleting conversation:', error);
      throw error;
    }
  }

  async getAllConversations(): Promise<ConversationState[]> {
    try {
      const snapshot = await this.db
        .collection(this.COLLECTIONS.CONVERSATIONS)
        .orderBy('lastUpdated', 'desc')
        .get();

      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          lastUpdated: data.lastUpdated?.toDate(),
        } as ConversationState;
      });
    } catch (error) {
      console.error('Error getting all conversations:', error);
      throw error;
    }
  }

  /**
   * Clean up old conversations (idle for more than 24 hours)
   */
  async cleanupOldConversations(): Promise<number> {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const snapshot = await this.db
        .collection(this.COLLECTIONS.CONVERSATIONS)
        .where('lastUpdated', '<', admin.firestore.Timestamp.fromDate(oneDayAgo))
        .get();

      const batch = this.db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      console.log(`🧹 Cleaned up ${snapshot.size} old conversations`);
      return snapshot.size;
    } catch (error) {
      console.error('Error cleaning up conversations:', error);
      throw error;
    }
  }

  /**
   * USERS COLLECTION (for storing customer info)
   */

  async saveUser(phone: string, data: any): Promise<void> {
    try {
      await this.db.collection(this.COLLECTIONS.USERS).doc(phone).set(
        {
          phone,
          ...data,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error('Error saving user:', error);
      throw error;
    }
  }

  async getUser(phone: string): Promise<any | null> {
    try {
      const doc = await this.db.collection(this.COLLECTIONS.USERS).doc(phone).get();
      return doc.exists ? doc.data() : null;
    } catch (error) {
      console.error('Error getting user:', error);
      throw error;
    }
  }

  /**
   * ANALYTICS COLLECTION
   */

  async logAnalytics(event: string, data: any): Promise<void> {
    try {
      console.log(`📊 Logging analytics event: ${event}`, data);

      // Use GA4 if configured (FREE & UNLIMITED)
      if (this.ga4) {
        const userId = data.phone || data.orderId;
        await this.ga4.logEvent(event, data, userId);
      } else {
        console.log('⚠️  GA4 not configured, analytics not sent');
      }

      console.log(`✅ Analytics event logged successfully: ${event}`);
    } catch (error) {
      console.error('❌ Error logging analytics:', error);
      // Don't throw, analytics should not break the app
    }
  }

  async getAnalytics(
    event?: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 100
  ): Promise<any[]> {
    try {
      let query: any = this.db.collection(this.COLLECTIONS.ANALYTICS);

      if (event) {
        query = query.where('event', '==', event);
      }

      if (startDate) {
        query = query.where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startDate));
      }

      if (endDate) {
        query = query.where('timestamp', '<=', admin.firestore.Timestamp.fromDate(endDate));
      }

      query = query.orderBy('timestamp', 'desc').limit(limit);

      const snapshot = await query.get();
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('Error getting analytics:', error);
      throw error;
    }
  }

  /**
   * STATS
   */

  async getStats(): Promise<any> {
    try {
      const [ordersSnapshot, conversationsSnapshot] = await Promise.all([
        this.db.collection(this.COLLECTIONS.ORDERS).count().get(),
        this.db.collection(this.COLLECTIONS.CONVERSATIONS).count().get(),
      ]);

      // Get orders by status
      const statusCounts: any = {};
      const statusSnapshot = await this.db.collection(this.COLLECTIONS.ORDERS).get();

      statusSnapshot.docs.forEach(doc => {
        const status = doc.data().status;
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });

      return {
        totalOrders: ordersSnapshot.data().count,
        activeConversations: conversationsSnapshot.data().count,
        ordersByStatus: statusCounts,
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      throw error;
    }
  }

  /**
   * Batch operations
   */

  async batchSaveOrders(orders: Order[]): Promise<void> {
    try {
      const batch = this.db.batch();

      orders.forEach(order => {
        const ref = this.db.collection(this.COLLECTIONS.ORDERS).doc(order.id);
        batch.set(ref, {
          ...order,
          createdAt: admin.firestore.Timestamp.fromDate(order.createdAt),
          completedAt: order.completedAt
            ? admin.firestore.Timestamp.fromDate(order.completedAt)
            : null,
          estimatedDelivery: order.estimatedDelivery
            ? admin.firestore.Timestamp.fromDate(order.estimatedDelivery)
            : null,
        });
      });

      await batch.commit();
    } catch (error) {
      console.error('Error batch saving orders:', error);
      throw error;
    }
  }

  /**
   * FIREBASE STORAGE
   */

  /**
   * Upload audio buffer to Firebase Storage
   * @param orderId - Order ID for organizing files
   * @param songIndex - Song index (1, 2, etc.)
   * @param audioBuffer - Audio file buffer
   * @returns Public URL to the uploaded file (signed URL, valid for 7 days)
   */
  async uploadAudio(orderId: string, songIndex: number, audioBuffer: Buffer): Promise<string> {
    try {
      const filename = `music/${orderId}/song${songIndex}_${Date.now()}.mp3`;
      const file = this.bucket.file(filename);

      console.log(`📤 Uploading audio to Firebase Storage: ${filename}`);
      console.log(`   Size: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`);

      // Upload buffer to Storage (without public: true - uniform bucket-level access)
      await file.save(audioBuffer, {
        metadata: {
          contentType: 'audio/mpeg',
          metadata: {
            orderId,
            songIndex: songIndex.toString(),
            uploadedAt: new Date().toISOString(),
          },
        },
        resumable: false, // Faster for small files
      });

      // Generate signed URL (valid for 7 days)
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      console.log(`✅ Audio uploaded successfully`);
      console.log(`   URL: ${signedUrl.substring(0, 100)}...`);

      return signedUrl;
    } catch (error: any) {
      console.error('❌ Error uploading audio to Storage:', error.message);
      throw new Error(`Firebase Storage yükleme hatası: ${error.message}`);
    }
  }

  /**
   * Upload video buffer to Firebase Storage
   */
  async uploadVideo(orderId: string, videoBuffer: Buffer): Promise<string> {
    try {
      const filename = `videos/${orderId}/video_${Date.now()}.mp4`;
      const file = this.bucket.file(filename);

      console.log(`📤 Uploading video to Firebase Storage: ${filename}`);

      await file.save(videoBuffer, {
        metadata: {
          contentType: 'video/mp4',
          metadata: {
            orderId,
            uploadedAt: new Date().toISOString(),
          },
        },
        resumable: false,
      });

      // Generate signed URL (valid for 7 days)
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      console.log(`✅ Video uploaded successfully`);
      return signedUrl;
    } catch (error: any) {
      console.error('Error uploading video to Storage:', error.message);
      throw new Error(`Firebase Storage video yükleme hatası: ${error.message}`);
    }
  }

  /**
   * Delete file from Firebase Storage
   */
  async deleteFile(filepath: string): Promise<void> {
    try {
      const file = this.bucket.file(filepath);
      await file.delete();
      console.log(`🗑️ Deleted file from Storage: ${filepath}`);
    } catch (error: any) {
      console.error('Error deleting file from Storage:', error.message);
      // Don't throw - file might not exist
    }
  }

  /**
   * Get Firestore database instance (for queue service)
   */
  getDb(): admin.firestore.Firestore {
    return this.db;
  }

  /**
   * Get Storage bucket instance
   */
  getBucket(): any {
    return this.bucket;
  }

  /**
   * DISCOUNT CODES COLLECTION
   */

  async saveDiscountCode(discountCode: DiscountCode): Promise<void> {
    try {
      await this.db.collection(this.COLLECTIONS.DISCOUNTS).doc(discountCode.id).set({
        ...discountCode,
        validFrom: admin.firestore.Timestamp.fromDate(discountCode.validFrom),
        validUntil: discountCode.validUntil
          ? admin.firestore.Timestamp.fromDate(discountCode.validUntil)
          : null,
        createdAt: admin.firestore.Timestamp.fromDate(discountCode.createdAt),
      });
    } catch (error) {
      console.error('Error saving discount code:', error);
      throw error;
    }
  }

  async getDiscountCodeByCode(code: string): Promise<DiscountCode | null> {
    try {
      const snapshot = await this.db
        .collection(this.COLLECTIONS.DISCOUNTS)
        .where('code', '==', code.toUpperCase())
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      const data = snapshot.docs[0].data();
      return {
        ...data,
        validFrom: data.validFrom?.toDate(),
        validUntil: data.validUntil?.toDate(),
        createdAt: data.createdAt?.toDate(),
      } as DiscountCode;
    } catch (error) {
      console.error('Error getting discount code:', error);
      throw error;
    }
  }

  async getAllDiscountCodes(): Promise<DiscountCode[]> {
    try {
      const snapshot = await this.db
        .collection(this.COLLECTIONS.DISCOUNTS)
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          validFrom: data.validFrom?.toDate(),
          validUntil: data.validUntil?.toDate(),
          createdAt: data.createdAt?.toDate(),
        } as DiscountCode;
      });
    } catch (error) {
      console.error('Error getting all discount codes:', error);
      throw error;
    }
  }

  async updateDiscountCode(id: string, updates: Partial<DiscountCode>): Promise<void> {
    try {
      const updateData: any = { ...updates };

      if (updates.validFrom) {
        updateData.validFrom = admin.firestore.Timestamp.fromDate(updates.validFrom);
      }
      if (updates.validUntil) {
        updateData.validUntil = admin.firestore.Timestamp.fromDate(updates.validUntil);
      }

      await this.db.collection(this.COLLECTIONS.DISCOUNTS).doc(id).update(updateData);
    } catch (error) {
      console.error('Error updating discount code:', error);
      throw error;
    }
  }

  async deleteDiscountCode(id: string): Promise<void> {
    try {
      await this.db.collection(this.COLLECTIONS.DISCOUNTS).doc(id).delete();
    } catch (error) {
      console.error('Error deleting discount code:', error);
      throw error;
    }
  }

  async incrementDiscountUsage(discountCodeId: string): Promise<void> {
    try {
      await this.db
        .collection(this.COLLECTIONS.DISCOUNTS)
        .doc(discountCodeId)
        .update({
          usedCount: admin.firestore.FieldValue.increment(1),
        });
    } catch (error) {
      console.error('Error incrementing discount usage:', error);
      throw error;
    }
  }

  /**
   * DISCOUNT USAGES COLLECTION
   */

  async saveDiscountUsage(usage: DiscountUsage): Promise<void> {
    try {
      await this.db.collection(this.COLLECTIONS.DISCOUNT_USAGES).doc(usage.id).set({
        ...usage,
        usedAt: admin.firestore.Timestamp.fromDate(usage.usedAt),
      });
    } catch (error) {
      console.error('Error saving discount usage:', error);
      throw error;
    }
  }

  async getDiscountUsages(discountCodeId: string): Promise<DiscountUsage[]> {
    try {
      const snapshot = await this.db
        .collection(this.COLLECTIONS.DISCOUNT_USAGES)
        .where('discountCodeId', '==', discountCodeId)
        .orderBy('usedAt', 'desc')
        .get();

      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          usedAt: data.usedAt?.toDate(),
        } as DiscountUsage;
      });
    } catch (error) {
      console.error('Error getting discount usages:', error);
      throw error;
    }
  }
}
