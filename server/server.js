require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');
const authRoutes = require('./routes/auth');
const auditRoutes = require('./routes/audits');
const areaRoutes = require('./routes/areas');
const atmRoutes = require('./routes/atms');
const checklistRoutes = require('./routes/checklist');
const assignmentRoutes = require('./routes/assignments');

const app = express();

// A single bad request throwing inside an async route handler would otherwise
// crash the whole process (Express 4 doesn't catch async errors automatically).
process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection:', err);
});

app.use(cors());
app.use(express.json({ limit: '25mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/audits', auditRoutes);
app.use('/api/areas', areaRoutes);
app.use('/api/atms', atmRoutes);
app.use('/api/checklist', checklistRoutes);
app.use('/api/assignments', assignmentRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, database: 'mongodb' }));

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT} (MongoDB Connected)`));
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB database:', err);
    process.exit(1);
  });
