const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Area = sequelize.define(
  'Area',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: { notEmpty: true },
      set(val) {
        this.setDataValue('name', val ? val.trim() : val);
      },
    },
  },
  {
    tableName: 'areas',
    timestamps: true,
  }
);

Area.prototype.toJSON = function () {
  const values = { ...this.get() };
  values._id = values.id;
  return values;
};

module.exports = Area;
