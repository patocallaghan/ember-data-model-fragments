import MF from 'ember-data-model-fragments';

export default MF.Fragment.extend({
  parts: MF.fragmentArray('part'),
});
