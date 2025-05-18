const mongoose = require('mongoose')

mongoose.connect(process.env.DB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})

mongoose.connection.on('connected', () => {
    console.log('Connected to MongoDB Atlas')
})

mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err)
})

module.exports = mongoose
