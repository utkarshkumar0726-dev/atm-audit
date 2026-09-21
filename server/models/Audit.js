const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Audit = sequelize.define(
  'Audit',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    atmId: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { notEmpty: true },
    },
    area: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { notEmpty: true },
    },
    auditorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    photos: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    stages: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
  },
  {
    tableName: 'audits',
    timestamps: true,
  }
);

Audit.prototype.toJSON = function () {
  const values = { ...this.get() };
  values._id = values.id;
  return values;
};

module.exports = Audit;
