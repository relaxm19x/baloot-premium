const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();

// تفعيل مشاركة الموارد لتسهيل الاتصال بين فرونت إند الموقع والسيرفر
app.use(cors());
app.use(express.json());

// الرابط الرسمي الموحد لـ API موقع SMMGlobe بناءً على الصفحة التي أرسلتها
const SMM_API_URL = 'https://smmglobe.com/api/v2';

/**
 * نقطة النهاية (Endpoint): استقبال الدفع الناجح وتمرير الطلب فوراً لـ SMMGlobe
 */
app.post('/api/payment-success', async (req, res) => {
    try {
        const { orderDetails, paypalTransactionId } = req.body;

        // 1. التحقق التلقائي من سلامة البيانات المستقبلة من الموقع
        if (!orderDetails || !orderDetails.smmId || !orderDetails.link || !orderDetails.quantity) {
            console.error('[خطأ]: بيانات الطلب القادمة من المتجر غير مكتملة.');
            return res.status(400).json({ 
                success: false, 
                message: 'فشل التمرير التلقائي: بيانات الخدمة أو الرابط أو الكمية ناقصة.' 
            });
        }

        // 2. جلب مفتاح الـ API الخاص بـ SMMGlobe المخزن بأمان في السيرفر
        const SMM_API_KEY = process.env.SMM_API_KEY;

        if (!SMM_API_KEY || SMM_API_KEY.trim() === '') {
            console.error('[خطأ حرج]: لم يتم ضبط مفتاح SMM_API_KEY في إعدادات Render.');
            return res.status(500).json({
                success: false,
                message: 'خطأ في إعدادات السيرفر: مفتاح الـ API الخاص بـ SMMGlobe غير موجود.'
            });
        }

        console.log(`[PayPal]: تم استقبال تأكيد الدفع بنجاح للمعاملة: ${paypalTransactionId}`);
        console.log(`[SMMGlobe]: جاري إرسال الطلب تلقائياً للخدمة رقم: ${orderDetails.smmId}`);

        // 3. بناء وتجهيز البيانات بالصيغة المطلوبة تماماً بمستند SMMGlobe (URL Encoded)
        // المعاملات المطلوبة: key, action, service, link, quantity
        const params = new URLSearchParams();
        params.append('key', SMM_API_KEY.trim());
        params.append('action', 'add');
        params.append('service', orderDetails.smmId.toString());
        params.append('link', orderDetails.link.toString());
        params.append('quantity', orderDetails.quantity.toString());

        // 4. إرسال الطلب بشكل آمن ومباشر إلى سيرفر SMMGlobe بنظام POST
        const response = await axios.post(SMM_API_URL, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        // 5. تحليل استجابة السيرفر وتأكيد التمرير
        if (response.data && response.data.order) {
            console.log(`✅ نجاح التمرير التلقائي! رقم الطلب في SMMGlobe: ${response.data.order}`);
            return res.status(200).json({
                success: true,
                message: 'تمت العملية بنجاح كامل: استلام المال وتمرير الطلب تلقائياً.',
                smmOrderId: response.data.order
            });
        } else if (response.data && response.data.error) {
            console.error(`❌ رفض من SMMGlobe API: ${response.data.error}`);
            return res.status(400).json({
                success: false,
                message: `فشل التمرير التلقائي من السيرفر: ${response.data.error}`
            });
        } else {
            console.error('[SMMGlobe]: استجابة مبهمة أو غير متوقعة:', response.data);
            return res.status(500).json({
                success: false,
                message: 'حدث رد غير معروف من سيرفر تجهيز الخدمات.'
            });
        }

    } catch (error) {
        console.error('❌ خطأ في الاتصال بالشبكة أو السيرفر الخارجي:', error.message);
        return res.status(500).json({
            success: false,
            message: 'فشل الاتصال التلقائي بسيرفر الخدمات، يرجى مراجعة حالة الخادم.'
        });
    }
});

// تشغيل السيرفر على البورت المتاح في بيئة الاستضافة
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل بأعلى كفاءة وجاهز تماماً للتمرير على البورت: ${PORT}`);
});
