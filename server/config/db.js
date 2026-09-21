const { Sequelize } = require('sequelize');
const mysql = require('mysql2/promise');

const host = process.env.MYSQL_HOST || '127.0.0.1';
const port = Number(process.env.MYSQL_PORT) || 3306;
const user = process.env.MYSQL_USER || 'root';
const password = process.env.MYSQL_PASSWORD || '';
const database = process.env.MYSQL_DATABASE || 'atm_audit';
const uri = process.env.MYSQL_URI || process.env.DATABASE_URL;

let sequelize;

if (uri) {
  sequelize = new Sequelize(uri, {
    dialect: 'mysql',
    logging: false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  });
} else {
  sequelize = new Sequelize(database, user, password, {
    host,
    port,
    dialect: 'mysql',
    logging: false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  });
}

// Automatically create database if it doesn't exist (when using host/user/pass)
async function ensureDatabaseExists() {
  if (uri) return; // For cloud managed URIs, database is usually pre-provisioned
  try {
    const connection = await mysql.createConnection({ host, port, user, password });
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\`;`);
    await connection.end();
  } catch (err) {
    console.warn('Could not auto-create database (might already exist or insufficient permissions):', err.message);
  }
}

async function connectDB() {
  await ensureDatabaseExists();
  await sequelize.authenticate();
  console.log('MySQL connected successfully.');
  
  // Require models index to register associations
  require('../models');
  
  await sequelize.sync({ alter: true });
  console.log('MySQL database synchronized.');
}

module.exports = { sequelize, connectDB };
