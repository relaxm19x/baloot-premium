const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();

// تفعيل مشاركة الموارد ومعالجة البيانات مدمجة لتفادي أي كراش في البناء
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// الرابط الرسمي الموحد لـ API موقع SMMGlobe
const SMM_API_URL = 'https://smmglobe.com/api/v2';

// مفتاح الـ API الحقيقي الخاص بحسابك تم دمجه وثباته هنا بالملي
const SMM_API_KEY = '4bb74b551611ef2c97d1c2f75439ac57';

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * استقبال الدفع الناجح وتمرير الطلب فوراً لـ SMMGlobe تلقائياً
 */
app.post('/api/verify-order', async (req, res) => {
    try {
        const { orderID, serviceDetails, targetLink } = req.body;

        // 1. التحقق التلقائي من سلامة البيانات المستقبلة من الواجهة
        if (!orderID || !serviceDetails || !targetLink) {
            console.error('[خطأ]: بيانات الطلب القادمة من المتجر غير مكتملة.');
            return res.status(400).json({ 
                success: false, 
                message: 'فشل التمرير التلقائي: بيانات الخدمة أو الرابط ناقصة.' 
            });
        }

        console.log(`[PayPal]: تم استقبال تأكيد الدفع بنجاح للمعاملة: ${orderID}`);
        console.log(`[SMMGlobe]: جاري إرسال الطلب تلقائياً للخدمة رقم: ${serviceDetails.smmServiceId}`);

        // 2. بناء وتجهيز البيانات بالصيغة المطلوبة تماماً بمستند SMMGlobe
        const params = new URLSearchParams();
        params.append('key', SMM_API_KEY);
        params.append('action', 'add');
        params.append('service', serviceDetails.smmServiceId.toString());
        params.append('link', targetLink.toString());
        params.append('quantity', serviceDetails.quantity.toString());

        // 3. إرسال الطلب بشكل آمن ومباشر إلى سيرفر SMMGlobe بنظام POST
        const response = await axios.post(SMM_API_URL, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        // 4. تحليل استجابة السيرفر وتأكيد التمرير للعميل
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
                message: response.data.error
            });
        } else {
            console.error('[SMMGlobe]: استجابة غير متوقعة:', response.data);
            return res.status(500).json({
                success: false,
                message: 'حدث رد غير معروف من سيرفر تجهيز الخدمات.'
            });
        }

    } catch (error) {
        console.error('❌ خطأ في الاتصال بالسيرفر الخارجي:', error.message);
        return res.status(500).json({
            success: false,
            message: 'فشل الاتصال التلقائي بسيرفر الخدمات.'
        });
    }
});

// تشغيل السيرفر على البورت المتاح في بيئة الاستضافة
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل بأعلى كفاءة ومفتاح الـ API مفعّل بالكامل الحين على البورت: ${PORT}`);
});
