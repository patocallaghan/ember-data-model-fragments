import FactoryGuy from 'ember-data-factory-guy';

FactoryGuy.define('zoo', {
  default: {
    name: 'Cincinnati Zoo',
    manager: FactoryGuy.belongsTo('person')
  }
});