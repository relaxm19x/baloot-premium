// server.js - الباكيند الرسمي المصلح والمستقر لمتجر ADD MORE SHOP
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const path = require('path');
const bodyParser = require('body-parser');
const https = require('https'); // الاعتماد الكلي على المكتبة الرسمية المستقرة

app.use(bodyParser.json());
app.use(express.express?.static ? express.static(path.join(__dirname)) : express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3000;

// ⚠️ ضع مفتاح الـ API الخاص بك من صفحة Account في SMMGlobe مكان النص بالأسفل:
const SMM_API_KEY = "ضع_هنا_مفتاح_الـ_API_الخاص_بكامل_من_صفحة_الـ_Account";

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/verify-order', (req, res) => {
    const { orderID, serviceDetails, targetLink } = req.body;

    if (!orderID || !serviceDetails || !targetLink) {
        return res.status(400).json({ success: false, message: "بيانات الطلب غير مكتملة!" });
    }

    console.log(`💰 تم تأكيد معاملة دفع عبر PayPal برقم: ${orderID}`);

    // تجهيز البيانات المتوافقة مع سيرفر SMMGlobe بصيغة x-www-form-urlencoded
    const postData = new URLSearchParams({
        key: SMM_API_KEY,
        action: 'add',
        service: serviceDetails.smmServiceId,
        link: targetLink,
        quantity: serviceDetails.quantity
    }).toString();

    const options = {
        hostname: 'smmglobe.com',
        port: 443,
        path: '/api/v2',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const SmmReq = https.request(options, (smmRes) => {
        let data = '';
        smmRes.on('data', (chunk) => { data += chunk; });
        smmRes.on('end', () => {
            try {
                const smmResult = JSON.parse(data);
                if (smmResult && smmResult.order) {
                    return res.json({ 
                        success: true, 
                        message: "تم تمرير الطلب التلقائي بنجاح الحين!",
                        smmOrderId: smmResult.order
                    });
                } else {
                    return res.status(400).json({ 
                        success: false, 
                        message: smmResult.error || "فشل السيرفر في قبول المعاملة التلقائية." 
                    });
                }
            } catch (e) {
                return res.status(500).json({ success: false, message: "خطأ في قراءة استجابة سيرفر المتابعين." });
            }
        });
    });

    SmmReq.on('error', (error) => {
        return res.status(500).json({ success: false, message: "حدث خطأ في الاتصال بسيرفر الأتمتة." });
    });

    SmmReq.write(postData);
    SmmReq.end();
});

http.listen(PORT, () => {
    console.log(`🚀 ADD MORE SHOP Active with Full Platforms on Port ${PORT}`);
});
