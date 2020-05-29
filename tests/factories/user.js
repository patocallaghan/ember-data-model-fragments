import FactoryGuy from 'ember-data-factory-guy';

FactoryGuy.define('user', {
  default: {
    info: FactoryGuy.belongsTo('info'),
  }
});
