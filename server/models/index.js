const User = require('./User');
const Area = require('./Area');
const Stage = require('./Stage');
const ChecklistQuestion = require('./ChecklistQuestion');
const Atm = require('./Atm');
const Assignment = require('./Assignment');
const Audit = require('./Audit');

// Associations
Atm.belongsTo(Area, { foreignKey: 'areaId', as: 'area' });
Area.hasMany(Atm, { foreignKey: 'areaId', as: 'atms' });

Stage.hasMany(ChecklistQuestion, { foreignKey: 'stageId', as: 'questions', onDelete: 'CASCADE' });
ChecklistQuestion.belongsTo(Stage, { foreignKey: 'stageId', as: 'stage' });

Assignment.belongsTo(User, { foreignKey: 'auditorId', as: 'auditor', onDelete: 'CASCADE' });
Assignment.belongsTo(Atm, { foreignKey: 'atmId', as: 'atm', onDelete: 'CASCADE' });
User.hasMany(Assignment, { foreignKey: 'auditorId', as: 'assignments' });
Atm.hasMany(Assignment, { foreignKey: 'atmId', as: 'assignments' });

Audit.belongsTo(User, { foreignKey: 'auditorId', as: 'auditor' });
User.hasMany(Audit, { foreignKey: 'auditorId', as: 'audits' });

module.exports = {
  User,
  Area,
  Stage,
  ChecklistQuestion,
  Atm,
  Assignment,
  Audit,
};
