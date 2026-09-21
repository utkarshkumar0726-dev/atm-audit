const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Stage = sequelize.define(
  'Stage',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { notEmpty: true },
      set(val) {
        this.setDataValue('name', val ? val.trim() : val);
      },
    },
    order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: 'stages',
    timestamps: true,
  }
);

Stage.prototype.toJSON = function () {
  const values = { ...this.get() };
  values._id = values.id;
  return values;
};

module.exports = Stage;
