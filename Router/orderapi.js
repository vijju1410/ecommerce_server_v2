const express = require('express');
const router = express.Router();
const fs = require("fs");
const PDFDocument = require("pdfkit");
const path = require("path");
const Order = require('../Model/order');
const Cart = require('../Model/cart');
const User = require('../Model/user');
const { v4: uuidv4 } = require('uuid');
const sendEmail = require("../utils/sendEmail");
const sendWhatsAppMessage = require("../utils/sendWhatsApp");
const twilio = require("twilio");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

const twilioClient = twilio(accountSid, authToken);
const twilioWhatsAppNumber = "whatsapp:+14155238886"; // Twilio Sandbox Number

const uploadDir = path.join(__dirname, "../uploads/bills");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

router.post("/placeOrder", async (req, res) => {
  try {
      const { userId, address, paymentMethod, paymentInfo } = req.body;

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const cart = await Cart.findOne({ userId }).populate("products.productId");
      if (!cart || cart.products.length === 0) {
          return res.status(400).json({ message: "Cart is empty. Add items first." });
      }

      const orderId = `ORD-${uuidv4().split("-")[0]}`;
      const orderItems = cart.products.map((item) => ({
          productId: item.productId._id,
          productName: item.productId.product_name,
          quantity: item.quantity,
          price: item.productId.product_price,
          total: item.quantity * item.productId.product_price,
      }));

      const orderData = {
          orderId,
          userId,
          username: user.user_name,
          items: orderItems,
          totalPrice: cart.totalPrice,
          address,
          paymentMethod,
          status: "Pending",
      };

      if (paymentMethod === "Online") {
          if (!paymentInfo || !paymentInfo.paymentId) {
              return res.status(400).json({ message: "Payment details missing" });
          }
          orderData.paymentInfo = {
              paymentId: paymentInfo.paymentId,
              status: paymentInfo.status,
          };
      }

      const order = new Order(orderData);
      await order.save();
      await Cart.findOneAndDelete({ userId });

      // ✅ Generate PDF Invoice
      const pdfPath = path.join(uploadDir, `Invoice_${orderId}.pdf`);
      const pdfDoc = new PDFDocument();
      const pdfStream = fs.createWriteStream(pdfPath);
      pdfDoc.pipe(pdfStream);

      pdfDoc.fontSize(20).text("Invoice", { align: "center" }).moveDown();
      pdfDoc.fontSize(12).text(`Order ID: ${orderId}`);
      pdfDoc.text(`Customer: ${user.user_name}`);
      pdfDoc.text(`Email: ${user.user_email}`);
      pdfDoc.text(`Address: ${address.street}, ${address.city}, ${address.state}, ${address.postalCode}`);
      pdfDoc.text(`Payment Method: ${paymentMethod}`).moveDown();

      pdfDoc.text("Order Items:", { underline: true });
      orderItems.forEach((item) => {
          pdfDoc.text(`${item.productName} - ${item.quantity} x ₹${item.price} = ₹${item.total}`);
      });

      pdfDoc.text(`Total Amount: ₹${cart.totalPrice}`, { bold: true }).moveDown();
      pdfDoc.text("Thank you for shopping with us!", { align: "center" });

      pdfDoc.end();

      // ✅ Wait for PDF to be fully written
      pdfStream.on("finish", async () => {
          console.log("✅ PDF generated successfully:", pdfPath);

          order.billUrl = `/uploads/bills/Invoice_${orderId}.pdf`;
          await order.save();

          // ✅ Send Email After PDF is Ready
          const emailSubject = "🛒 Your Order Invoice";
          const emailBody = `
              <h2>Thank you for your order!</h2>
              <p>Order ID: <strong>${orderId}</strong></p>
              <p>Total Amount: <strong>₹${cart.totalPrice}</strong></p>
              <p>Click the button below to download your invoice:</p>
              <a href="http://localhost:5000${order.billUrl}" style="display:inline-block;padding:10px 15px;background:#28a745;color:white;text-decoration:none;border-radius:5px;">Download Invoice</a>
              <p>We appreciate your business!</p>
          `;

          await sendEmail(user.user_email, emailSubject, emailBody, pdfPath);

          // ✅ Send WhatsApp Message
          

          try {
            const phoneNumber = user.user_mobile.startsWith("+91") ? user.user_mobile : `+91${user.user_mobile}`;
            console.log("✅ Final Phone Number for WhatsApp:", phoneNumber);
        
            const orderItemsText = orderItems.map((item, index) => 
                `🔹 *${index + 1}. ${item.productName}* - ${item.quantity} x ₹${item.price} = ₹${item.total}`
            ).join("\n");
        
            const message = await twilioClient.messages.create({
                from: twilioWhatsAppNumber,
                to: `whatsapp:${phoneNumber}`, 
                body: `🛍️ *Thank you for shopping with us!*\n\n
                📦 *Order ID:* ${orderId}\n
                👤 *Customer Name:* ${user.user_name}\n
                📧 *Email:* ${user.user_email}\n
                📱 *Mobile:* ${user.user_mobile}\n\n
                🛒 *Order Items:*\n${orderItemsText}\n
                💰 *Total Amount:* ₹${cart.totalPrice}\n
                🚚 *Delivery Address:* ${address.street}, ${address.city}, ${address.state}, ${address.postalCode}\n
                🛒 *Payment Method:* ${paymentMethod}\n\n
                🔔 *Status:* Your order is being processed. We will update you soon! ✅`,
            });
        
            console.log("✅ WhatsApp message sent successfully:", message.sid);
        } catch (error) {
            console.error("❌ Error sending WhatsApp message:", error);
        }

          res.status(201).json({
              message: "Order placed successfully. Invoice sent via email & WhatsApp.",
              order,
              billUrl: order.billUrl,
          });
      });

      pdfStream.on("error", (err) => {
          console.error("❌ Error writing PDF:", err);
          res.status(500).json({ message: "Error generating invoice", error: err.message });
      });

  } catch (error) {
      console.error("❌ Error placing order:", error);
      res.status(500).json({ message: "Server error", error: error.message });
  }
});
// ✅ 2. Get All Orders (Admin Only)
router.get('/allOrders', async (req, res) => {
    try {
        const orders = await Order.find().populate('userId', 'user_name user_email').populate('items.productId');
        res.status(200).json({ message: 'Orders fetched successfully', orders });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching orders', error: err.message });
    }
});

// ✅ . Get User's Orders
// ✅ . Get User Order History
router.get("/getUserOrders/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const orders = await Order.find({ userId }).populate("items.productId").sort({ createdAt: -1 });

    res.status(200).json({ message: "User orders fetched successfully", orders });
  } catch (err) {
    res.status(500).json({ message: "Error fetching orders", error: err.message });
  }
});


// ✅ 4. Update Order Status (Admin Only)
router.put('/updateOrderStatus/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        const order = await Order.findByIdAndUpdate(orderId, { status }, { new: true });
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        res.status(200).json({ message: 'Order status updated successfully', order });
    } catch (err) {
        res.status(500).json({ message: 'Error updating order status', error: err.message });
    }
});
// Fetch total number of orders
router.get('/totalOrders', async (req, res) => {
    try {
      const totalOrders = await Order.countDocuments(); // Get total number of orders
      res.status(200).json({ totalOrders });
    } catch (err) {
      res.status(500).json({ message: 'Error fetching total orders', error: err.message });
    }
  });
// Fetch total revenue
router.get('/totalRevenue', async (req, res) => {
    try {
      const totalRevenue = await Order.aggregate([
        { $unwind: "$items" },
        { $group: { _id: null, totalRevenue: { $sum: "$items.total" } } },
      ]);
      res.status(200).json({ totalRevenue: totalRevenue[0]?.totalRevenue || 0 });
    } catch (err) {
      res.status(500).json({ message: 'Error fetching total revenue', error: err.message });
    }
  });
    
// Fetch total number of pending orders
router.get('/pendingOrders', async (req, res) => {
    try {
      const pendingOrders = await Order.countDocuments({ status: 'Pending' });
      res.status(200).json({ pendingOrders });
    } catch (err) {
      res.status(500).json({ message: 'Error fetching pending orders', error: err.message });
    }
  });
// ✅ 6. Get Recent Orders (Admin Only)
router.get('/recentOrders', async (req, res) => {
    try {
        // Fetch the latest 5 orders, sorted by creation date (newest first)
        const recentOrders = await Order.find()
            .populate('userId', 'user_name user_email') // populate user details
            .populate('items.productId') // populate product details in order items
            .sort({ createdAt: -1 }) // Sort by creation date in descending order
            .limit(5); // Limit to 5 recent orders

        res.status(200).json({
            message: 'Recent orders fetched successfully',
            orders: recentOrders,
        });
    } catch (err) {
        res.status(500).json({
            message: 'Error fetching recent orders',
            error: err.message,
        });
    }
});

// ✅ 5. Cancel Order
router.delete('/cancelOrder/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Restore products back to the cart
        await Cart.findOneAndUpdate(
            { userId: order.userId },
            { $push: { products: order.items } },
            { upsert: true }
        );

        await Order.findByIdAndDelete(orderId);

        res.status(200).json({ message: 'Order cancelled and items restored to cart', order });
    } catch (err) {
        res.status(500).json({ message: 'Error cancelling order', error: err.message });
    }
});

module.exports = router;
