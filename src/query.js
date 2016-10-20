import join from './join';
import descriptorForField from './descriptor-for-field';
import schemaForType from './schema-for-type';
import noop from './noop';

function formatArgPair(key, hash) {
  return `${key}: ${JSON.stringify(hash[key])}`;
}

function formatArgs(argumentHash) {
  const keys = Object.keys(argumentHash);

  if (!keys.length) {
    return '';
  }

  const formattedArgs = Object.keys(argumentHash).map((key) => {
    return formatArgPair(key, argumentHash);
  });

  return ` (${join(formattedArgs)})`;
}

function getArgsAndCallback(paramArgsCallback) {
  let callback = noop;
  let args = {};

  if (paramArgsCallback.length === 1) {
    if (typeof paramArgsCallback[0] === 'function') {
      callback = paramArgsCallback[0];
    } else {
      args = paramArgsCallback[0];
    }
  } else if (paramArgsCallback.length === 2) {
    [args, callback] = paramArgsCallback;
  }

  return {args, callback};
}

class Field {
  constructor(name, args, selectionSet) {
    this.name = name;
    this.args = args;
    this.selectionSet = selectionSet;
  }
  toString() {
    return `${this.name}${formatArgs(this.args)}${this.selectionSet.toString()}`;
  }
}

class InlineFragment {
  constructor(typeName, selectionSet) {
    this.typeName = typeName;
    this.selectionSet = selectionSet;
  }
  toString() {
    return `... on ${this.typeName}${this.selectionSet.toString()}`;
  }
}


export class SelectionSet {
  constructor(typeBundle, type, parent) {
    if (typeof type === 'string') {
      this.typeSchema = schemaForType(typeBundle, type);
    } else {
      this.typeSchema = type;
    }
    this.typeBundle = typeBundle;
    this.parent = parent;
    this.selections = [];
  }

  toString() {
    if (this.typeSchema.kind === 'SCALAR') {
      return '';
    } else {
      const commaDelimitedSelections = join(this.selections.map((selection) => {
        return selection.toString();
      }));

      return ` { ${commaDelimitedSelections} }`;
    }
  }

  getSelectionIndex(name) {
    return this.selections.findIndex((field) => {
      return field.name === name;
    });
  }

  /**
   * will add a field to be queried to the current query node.
   *
   * @param {String}    name The name of the field to add to the query
   * @param {Object}    [args] Arguments for the field to query
   * @param {Function}  [callback] Callback which will return a new query node for the field added
   */
  addField(name, ...paramArgsCallback) {
    const {args, callback} = getArgsAndCallback(paramArgsCallback);

    const idxSelection = this.getSelectionIndex(name);
    const fieldDescriptor = descriptorForField(this.typeBundle, name, this.typeSchema.name);
    const selectionSet = new SelectionSet(this.typeBundle, fieldDescriptor.schema, this);

    callback(selectionSet);

    if (idxSelection === -1) {
      this.selections.push(new Field(name, args, selectionSet));
    } else {
      this.selections[idxSelection] = new Field(name, args, selectionSet);
    }
  }

  /**
   * will add a connection to be queried to the current query node.
   *
   * @param {String}    name The name of the connection to add to the query
   * @param {Object}    [args] Arguments for the connection query eg. { first: 10 }
   * @param {Function}  [callback] Callback which will return a new query node for the connection added
   */
  addConnection(name, ...paramArgsCallback) {
    const {args, callback} = getArgsAndCallback(paramArgsCallback);

    const idxSelection = this.getSelectionIndex(name);
    const fieldDescriptor = descriptorForField(this.typeBundle, name, this.typeSchema.name);
    const selectionSet = new SelectionSet(this.typeBundle, fieldDescriptor.schema, this);

    selectionSet.addField('pageInfo', {}, (pageInfo) => {
      pageInfo.addField('hasNextPage');
      pageInfo.addField('hasPreviousPage');
    });

    selectionSet.addField('edges', {}, (edges) => {
      edges.addField('cursor');
      edges.addField('node', {}, callback);
    });

    if (idxSelection === -1) {
      this.selections.push(new Field(name, args, selectionSet));
    } else {
      this.selections[idxSelection] = new Field(name, args, selectionSet);
    }
  }

  addInlineFragmentOn(typeName, fieldTypeCb = noop) {
    const selectionSet = new SelectionSet(this.typeBundle, schemaForType(this.typeBundle, typeName), this);

    fieldTypeCb(selectionSet);
    this.selections.push(new InlineFragment(typeName, selectionSet));
  }
}

export class Query {
  constructor(typeBundle, selectionSetCallback) {
    this.typeBundle = typeBundle;
    this.selectionSet = new SelectionSet(typeBundle, 'QueryRoot', null);
    selectionSetCallback(this.selectionSet);
  }

  toString() {
    return `query${this.selectionSet.toString()}`;
  }
}
