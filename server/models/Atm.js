const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Atm = sequelize.define(
  'Atm',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    slNo: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    atmId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: { notEmpty: true },
      set(val) {
        this.setDataValue('atmId', val ? String(val).trim() : val);
      },
    },
    areaId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    vendor: {
      type: DataTypes.STRING,
      defaultValue: '',
      set(val) {
        this.setDataValue('vendor', val ? String(val).trim() : '');
      },
    },
    bic: {
      type: DataTypes.STRING,
      defaultValue: '',
      set(val) {
        this.setDataValue('bic', val ? String(val).trim() : '');
      },
    },
    branchName: {
      type: DataTypes.STRING,
      defaultValue: '',
      set(val) {
        this.setDataValue('branchName', val ? String(val).trim() : '');
      },
    },
    inchargeName: {
      type: DataTypes.STRING,
      defaultValue: '',
      set(val) {
        this.setDataValue('inchargeName', val ? String(val).trim() : '');
      },
    },
    inchargeDesig: {
      type: DataTypes.STRING,
      defaultValue: '',
      set(val) {
        this.setDataValue('inchargeDesig', val ? String(val).trim() : '');
      },
    },
    inchargeContact: {
      type: DataTypes.STRING,
      defaultValue: '',
      set(val) {
        this.setDataValue('inchargeContact', val ? String(val).trim() : '');
      },
    },
    address: {
      type: DataTypes.TEXT,
      defaultValue: '',
      set(val) {
        this.setDataValue('address', val ? String(val).trim() : '');
      },
    },
    pincode: {
      type: DataTypes.STRING,
      defaultValue: '',
      set(val) {
        this.setDataValue('pincode', val ? String(val).trim() : '');
      },
    },
    state: {
      type: DataTypes.STRING,
      defaultValue: '',
      set(val) {
        this.setDataValue('state', val ? String(val).trim() : '');
      },
    },
    siteType: {
      type: DataTypes.STRING,
      defaultValue: '',
      set(val) {
        this.setDataValue('siteType', val ? String(val).trim() : '');
      },
    },
    location: {
      type: DataTypes.STRING,
      defaultValue: '',
      set(val) {
        this.setDataValue('location', val ? String(val).trim() : '');
      },
    },
  },
  {
    tableName: 'atms',
    timestamps: true,
  }
);

Atm.prototype.toJSON = function () {
  const values = { ...this.get() };
  values._id = values.id;
  return values;
};

module.exports = Atm;
