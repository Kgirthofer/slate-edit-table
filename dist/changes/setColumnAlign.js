'use strict';

var TablePosition = require('../TablePosition');

var _require = require('immutable'),
    List = _require.List;

var ALIGN = require('../ALIGN');
var createAlign = require('../createAlign');

/**
 * Sets column alignment for a given column
 *
 * @param {Object} opts
 * @param {Slate.Change} change
 * @param {Number} at
 * @param {String} align
 * @return {Slate.Change}
 */
function setColumnAlign(opts, change) {
    var align = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : ALIGN.DEFAULT;
    var at = arguments[3];
    var state = change.state;
    var startBlock = state.startBlock;


    var pos = TablePosition.create(state, startBlock);
    var table = pos.table;

    // Figure out column position

    if (typeof at === 'undefined') {
        at = pos.getColumnIndex();
    }

    var newAlign = createAlign(pos.getWidth(), table.data.get('align'));
    newAlign[at] = align;

    change.setNodeByKey(table.key, {
        data: {
            align: Object.assign(table.data.toJS(), { align: newAlign })
        }
    });

    return change;
}

module.exports = setColumnAlign;