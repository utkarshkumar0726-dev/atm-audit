const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ChecklistQuestion = sequelize.define(
  'ChecklistQuestion',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    stageId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    text: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: { notEmpty: true },
      set(val) {
        this.setDataValue('text', val ? val.trim() : val);
      },
    },
    order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: 'checklist_questions',
    timestamps: true,
  }
);

ChecklistQuestion.prototype.toJSON = function () {
  const values = { ...this.get() };
  values._id = values.id;
  values.stage = values.stageId;
  return values;
};

module.exports = ChecklistQuestion;
