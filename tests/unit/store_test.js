import { run, schedule } from '@ember/runloop';
import { module, test } from 'qunit';
import { setupApplicationTest } from 'ember-qunit';
import Name from 'dummy/models/name';
import JSONAPISerializer from 'ember-data/serializers/json-api';
import JSONSerializer from 'ember-data/serializers/json';
import Pretender from 'pretender';

let store, owner;

module('unit - `DS.Store`', function(hooks) {
  setupApplicationTest(hooks);

  hooks.beforeEach(function(assert) {
    owner = this.owner;
    store = owner.lookup('service:store');

    assert.expectNoDeprecation();
  });

  hooks.afterEach(function() {
    store = null;
    owner = null;
  });

  test('a fragment can be created that starts in a dirty state', function(assert) {
    run(() => {
      let address = store.createFragment('name');

      assert.ok(address instanceof Name, 'fragment is correct type');
      assert.ok(address.get('hasDirtyAttributes'), 'fragment starts in dirty state');
    });
  });

  test('attempting to create a fragment type that does not inherit from `MF.Fragment` throws an error', function(assert) {
    run(() => {
      assert.throws(() => {
        store.createFragment('person');
      }, 'an error is thrown when given a bad type');
    });
  });

  test('the store has an `isFragment` method', function(assert) {
    assert.ok(store.isFragment('name'), 'a fragment should return true');
    assert.notOk(store.isFragment('person', 'a model should return false'));
  });

  test('the default fragment serializer does not use the application serializer', function(assert) {
    let Serializer = JSONAPISerializer.extend();
    owner.register('serializer:application', Serializer);

    assert.ok(!(store.serializerFor('name') instanceof Serializer), 'fragment serializer fallback is not `JSONAPISerializer`');
    assert.ok(store.serializerFor('name') instanceof JSONSerializer, 'fragment serializer fallback is correct');
  });

  test('the default fragment serializer does not use the adapter\'s `defaultSerializer`', function(assert) {
    store.set('defaultAdapter.defaultSerializer', '-json-api');

    assert.ok(!(store.serializerFor('name') instanceof JSONAPISerializer), 'fragment serializer fallback is not `JSONAPISerializer`');
    assert.ok(store.serializerFor('name') instanceof JSONSerializer, 'fragment serializer fallback is correct');
  });

  test('the default fragment serializer is `serializer:-fragment` if registered', function(assert) {
    let Serializer = JSONSerializer.extend();
    owner.register('serializer:-fragment', Serializer);

    assert.ok(store.serializerFor('name') instanceof Serializer, 'fragment serializer fallback is correct');
  });

  test('the application serializer can be looked up', function(assert) {
    assert.ok(store.serializerFor('application') instanceof JSONSerializer, 'application serializer can still be looked up');
  });

  test('the default serializer can be looked up', function(assert) {
    assert.ok(store.serializerFor('-default') instanceof JSONSerializer, 'default serializer can still be looked up');
  });

  test('unloadAll destroys fragments', function(assert) {
    run(() => {
      let person = store.createRecord('person', {
        name: {
          first: 'Catelyn',
          last: 'Stark'
        }
      });
      let name = person.get('name');

      store.unloadAll();

      schedule('destroy', () => {
        assert.ok(person.get('isDestroying'), 'the model is being destroyed');
        assert.ok(name.get('isDestroying'), 'the fragment is being destroyed');
      });
    });
  });

  test('A nested embedded record is not dirty after saving', function(assert) {
    run(() => {
      assert.expect(4);
      let done = assert.async();
      let server = new Pretender();
      let grandparentPayload = {
        id: 5,
        children: [
          // parent model
          {
            id: 3,
            children: [
              // child model
              {
                id: 2,
                // toy fragment
                toy: {
                  // part fragmentArray
                  // parts: [{ name: 'heart' }]
                  parts: [{ name: 'batteries' }, { name: 'eyes' }]
                }
              }
            ]
          }
        ]
      };
      store.pushPayload({
        grandparents: [grandparentPayload]
      });
      let grandparent = store.peekRecord('grandparent', 5);
      let toy = grandparent.children.firstObject.children.firstObject.toy;

      grandparentPayload.children[0].children[0].toy.parts = [{ name: 'heart'}];
      server.put('/grandparents/5', () => {
        return [200, { 'Content-Type': 'application/json' }, JSON.stringify(grandparentPayload)];
      });
      assert.notOk(toy.hasDirtyAttributes, 'toy is not initially dirty');
      toy.set('parts', [{ name: 'heart' }]);
      assert.ok(toy.hasDirtyAttributes, 'toy is dirty after a set');
      grandparent.save().then(() => {
        assert.notOk(toy.hasDirtyAttributes, 'toy is not dirty after a save');
        done();
      });
    });
  });
});
