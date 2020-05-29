import FactoryGuy from 'ember-data-factory-guy';

FactoryGuy.define('order', {
  default: {
    product: FactoryGuy.belongsTo('product')
  }
});
