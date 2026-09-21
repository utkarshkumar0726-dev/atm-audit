const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Assignment = sequelize.define(
  'Assignment',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    auditorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    atmId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: 'assignments',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['auditorId', 'atmId'],
      },
    ],
  }
);

Assignment.prototype.toJSON = function () {
  const values = { ...this.get() };
  values._id = values.id;
  return values;
};

module.exports = Assignment;
