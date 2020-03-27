import { assert } from '@ember/debug';
import { copy } from 'ember-copy';
import { typeOf } from '@ember/utils';
import { isArray } from '@ember/array';
import { get, setProperties, computed } from '@ember/object';
import StatefulArray from './array/stateful';
import FragmentArray from './array/fragment';
import {
  fragmentDidDirty,
  fragmentDidReset
} from './states';
import {
  internalModelFor,
  setFragmentOwner,
  setFragmentData,
  createFragment,
  isFragment
} from './fragment';
import isInstanceOfType from './util/instance-of-type';

/**
  @module ember-data-model-fragments
*/

// Create a unique type string for the combination of fragment property type,
// transform type (or fragment model), and polymorphic type key
function metaTypeFor(name, type, options) {
  let metaType = `-mf-${name}`;

  if (type) {
    metaType += `$${type}`;
  }

  if (options && options.polymorphic) {
    let typeKey = options.typeKey || 'type';
    metaType += `$${typeKey}`;
  }

  return metaType;
}

/**
  `MF.fragment` defines an attribute on a `DS.Model` or `MF.Fragment`. Much
  like `DS.belongsTo`, it creates a property that returns a single fragment of
  the given type.

  It takes an optional hash as a second parameter, currently supported options
  are:

  - `defaultValue`: An object literal or a function to be called to set the
    attribute to a default value if none is supplied. Values are deep copied
    before being used. Note that default values will be passed through the
    fragment's serializer when creating the fragment. Defaults to `null`.
  - `polymorphic`: Whether or not the fragments in the array can be child
    classes of the given type.
  - `typeKey`: If `polymorphic` is true, the property to use as the fragment
    type in the normalized data. Defaults to `type`.

  Example

  ```javascript
  App.Person = DS.Model.extend({
    name: MF.fragment('name', { defaultValue: {} })
  });

  App.Name = MF.Fragment.extend({
    first: DS.attr('string'),
    last: DS.attr('string')
  });
  ```

  @namespace MF
  @method fragment
  @param {String} type the fragment type
  @param {Object} options a hash of options
  @return {Attribute}
*/
function fragment(declaredModelName, options) {
  options = options || {};

  let metaType = metaTypeFor('fragment', declaredModelName, options);

  function setupFragment(store, record, key) {
    let internalModel = internalModelFor(record);
    let data = getWithDefault(internalModel, key, options, 'object');
    let fragment = internalModel._recordData.getFragment(key);

    // Regardless of whether being called as a setter or getter, the fragment
    // may not be initialized yet, in which case the data will contain a
    // raw response or a stashed away fragment

    // If we already have a processed fragment in _data and our current fragment is
    // null simply reuse the one from data. We can be in this state after a rollback
    // for example
    if (!fragment && isFragment(data)) {
      fragment = data;
    // Else initialize the fragment
    } else if (data && data !== fragment) {
      if (fragment) {
        // It's important to update internal model data to fragment before calling
        // setFragmentData since updating the fragment can trigger calls to
        // notifyPropertyChange which can in turn call setupFragment again, creating
        // an infinite recursion loop. Since it's a reference anyway doing the
        // assignation sooner has no side effect
        internalModel._recordData._data[key] = fragment;
        setFragmentData(fragment, data);
      } else {
        fragment = createFragment(store, declaredModelName, record, key, options, data);
        internalModel._recordData._data[key] = fragment;
      }

    } else {
      // Handle the adapter setting the fragment to null
      fragment = data;
    }

    return fragment;
  }

  function setFragmentValue(record, key, fragment, value) {
    let store = record.store;
    let internalModel = internalModelFor(record);

    assert(`You can only assign \`null\`, an object literal or a '${declaredModelName}' fragment instance to this property`, value === null || typeOf(value) === 'object' || isInstanceOfType(store.modelFor(declaredModelName), value));

    if (!value) {
      fragment = null;
    } else if (isFragment(value)) {
      // A fragment instance was given, so just replace the existing value
      fragment = setFragmentOwner(value, record, key);
    } else if (!fragment) {
      // A property hash was given but the property was null, so create a new
      // fragment with the data
      fragment = createFragment(store, declaredModelName, record, key, options, value);
    } else {
      // The fragment already exists and a property hash is given, so just set
      // its values and let the state machine take care of the dirtiness
      setProperties(fragment, value);

      return fragment;
    }

    if (internalModel._recordData._data[key] !== fragment) {
      fragmentDidDirty(record, key, fragment);
    } else {
      fragmentDidReset(record, key);
    }

    return fragment;
  }

  return fragmentProperty(metaType, options, setupFragment, setFragmentValue);
}

/**
  `MF.fragmentArray` defines an attribute on a `DS.Model` or `MF.Fragment`.
  Much like `DS.hasMany`, it creates a property that returns an array of
  fragments of the given type. The array is aware of its original state and so
  has a `hasDirtyAttributes` property and a `rollback` method.

  It takes an optional hash as a second parameter, currently supported options
  are:

  - `defaultValue`: An array literal or a function to be called to set the
    attribute to a default value if none is supplied. Values are deep copied
    before being used. Note that default values will be passed through the
    fragment's serializer when creating the fragment. Defaults to an empty
    array.
  - `polymorphic`: Whether or not the fragments in the array can be child
    classes of the given type.
  - `typeKey`: If `polymorphic` is true, the property to use as the fragment
    type in the normalized data. Defaults to `type`.

  Example

  ```javascript
  App.Person = DS.Model.extend({
    addresses: MF.fragmentArray('address')
  });

  App.Address = MF.Fragment.extend({
    street: DS.attr('string'),
    city: DS.attr('string'),
    region: DS.attr('string'),
    country: DS.attr('string')
  });
  ```

  @namespace MF
  @method fragmentArray
  @param {String} type the fragment type (optional)
  @param {Object} options a hash of options
  @return {Attribute}
*/
function fragmentArray(modelName, options) {
  options || (options = {});

  let metaType = metaTypeFor('fragment-array', modelName, options);

  return fragmentArrayProperty(metaType, options, function createFragmentArray(record, key) {
    return FragmentArray.create({
      type: modelName,
      options: options,
      name: key,
      owner: record
    });
  });
}

/**
  `MF.array` defines an attribute on a `DS.Model` or `MF.Fragment`. It creates a
  property that returns an array of values of the given primitive type. The
  array is aware of its original state and so has a `hasDirtyAttributes`
  property and a `rollback` method.

  It takes an optional hash as a second parameter, currently supported options
  are:

  - `defaultValue`: An array literal or a function to be called to set the
    attribute to a default value if none is supplied. Values are deep copied
    before being used. Note that default values will be passed through the
    fragment's serializer when creating the fragment.

  Example

  ```javascript
  App.Person = DS.Model.extend({
    aliases: MF.array('string')
  });
  ```

  @namespace MF
  @method array
  @param {String} type the type of value contained in the array
  @param {Object} options a hash of options
  @return {Attribute}
*/
function array(type, options) {
  if (typeof type === 'object') {
    options = type;
    type = undefined;
  } else {
    options || (options = {});
  }

  let metaType = metaTypeFor('array', type);

  return fragmentArrayProperty(metaType, options, function createStatefulArray(record, key) {
    return StatefulArray.create({
      options: options,
      name: key,
      owner: record
    });
  });
}

function fragmentProperty(type, options, setupFragment, setFragmentValue) {
  options = options || {};

  let meta = {
    type: type,
    isAttribute: true,
    isFragment: true,
    options: options
  };

  return computed({
    get(key) {
      let internalModel = internalModelFor(this);
      let fragment = setupFragment(this.store, this, key);

      return internalModel._recordData.setFragment(key, fragment);
    },
    set(key, value) {
      let internalModel = internalModelFor(this);
      let fragment = setupFragment(this.store, this, key);

      fragment = setFragmentValue(this, key, fragment, value);

      return internalModel._recordData.setFragment(key, fragment);
    }
  }).meta(meta);
}

function fragmentArrayProperty(metaType, options, createArray) {
  function setupFragmentArray(store, record, key) {
    let internalModel = internalModelFor(record);
    let data = getWithDefault(internalModel, key, options, 'array');
    let fragments = internalModel._recordData.getFragment(key) || null;

    // If we already have a processed fragment in _data and our current fragment is
    // null simply reuse the one from data. We can be in this state after a rollback
    // for example
    if (data instanceof StatefulArray && !fragments) {
      fragments = data;
    // Create a fragment array and initialize with data
    } else if (data && data !== fragments) {
      if (fragments) {
        internalModel._recordData._data[key] = fragments;
        fragments.setupData(data);
      } else {
        fragments = createArray(record, key);
        internalModel._recordData._data[key] = fragments;
        fragments.initData(data);
      }
    } else {
      // Handle the adapter setting the fragment array to null
      fragments = data;
    }

    return fragments;
  }

  function setFragmentValue(record, key, fragments, value) {
    let internalModel = internalModelFor(record);

    if (isArray(value)) {
      fragments || (fragments = createArray(record, key));
      fragments.setObjects(value);
    } else if (value === null) {
      fragments = null;
    } else {
      assert('A fragment array property can only be assigned an array or null');
    }

    if (internalModel._recordData._data[key] !== fragments || (fragments && get(fragments, 'hasDirtyAttributes'))) {
      fragmentDidDirty(record, key, fragments);
    } else {
      fragmentDidReset(record, key);
    }

    return fragments;
  }

  return fragmentProperty(metaType, options, setupFragmentArray, setFragmentValue);
}

/**
  `MF.fragmentOwner` defines a read-only attribute on a `MF.Fragment`
  instance. The attribute returns a reference to the fragment's owner
  record.

  Example

  ```javascript
  App.Person = DS.Model.extend({
    name: MF.fragment('name')
  });

  App.Name = MF.Fragment.extend({
    first: DS.attr('string'),
    last: DS.attr('string'),
    person: MF.fragmentOwner()
  });
  ```

  @namespace MF
  @method fragmentOwner
  @return {Attribute}
*/
function fragmentOwner() {
  return computed(function() {
    assert('Fragment owner properties can only be used on fragments.', isFragment(this));

    return internalModelFor(this)._recordData.getOwner();
  }).meta({
    isFragmentOwner: true
  }).readOnly();
}

// The default value of a fragment is either an array or an object,
// which should automatically get deep copied
function getDefaultValue(record, options, type) {
  let value;

  if (typeof options.defaultValue === 'function') {
    value = options.defaultValue();
  } else if ('defaultValue' in options) {
    value = options.defaultValue;
  } else if (type === 'array') {
    value = [];
  } else {
    return null;
  }

  assert(`The fragment's default value must be an ${type}`, (typeOf(value) == type) || (value === null));

  // No need to copy value if it was a function
  if (typeof options.defaultValue === 'function') {
    return value;
  }

  // Create a deep copy of the resulting value to avoid shared reference errors
  return copy(value, true);
}

// Returns the value of the property or the default propery
function getWithDefault(internalModel, key, options, type) {
  if (key in internalModel._recordData._data) {
    return internalModel._recordData._data[key];
  } else {
    return getDefaultValue(internalModel, options, type);
  }
}

export {
  fragment,
  fragmentArray,
  array,
  fragmentOwner
};
