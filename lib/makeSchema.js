const Slate = require('slate');
const { Range, List } = require('immutable');
const createAlign = require('./createAlign');

/**
 * Create a schema for tables
 * @param {Options} opts The plugin options
 * @return {Object} A schema definition with rules to normalize tables
 */
function makeSchema(opts) {
    return {
        rules: [
            noBlocksWithinCell(opts),
            cellsWithinTable(opts),
            rowsWithinTable(opts),
            tablesContainOnlyRows(opts),
            rowsContainRequiredColumns(opts),
            tableContainAlignData(opts)
        ]
    };
}

/**
 * Rule to enforce cells only contain inlines or text.
 * It unwrap blocks in cell blocks
 *
 * @param {Options} opts The plugin options
 * @return {Object} A rule to enforce cells only contain inlines or text.
 */
function noBlocksWithinCell(opts) {
    return {
        match(node) {
            return node.kind == 'block' && node.type == opts.typeCell;
        },

        // Find nested blocks
        validate(node) {
            const nestedBlocks = node.nodes.filter(
                child => child.kind === 'block'
            );

            return nestedBlocks.size > 0 ? nestedBlocks : null;
        },

        // If any, unwrap all nested blocks
        normalize(change, node, nestedBlocks) {
            nestedBlocks.forEach(
                (block, index) => block.nodes.forEach((grandChild) => {
                    if (change.state.document.hasDescendant(grandChild.key)) {
                        if (grandChild.kind === 'text' && index !== 0) {
                            change
                              .insertTextByKey(grandChild.key, 0, '\n')
                              .unwrapNodeByKey(grandChild.key, { normalize: false });
                        } else {
                            change
                              .unwrapNodeByKey(grandChild.key, { normalize: false });
                        }
                    }
                })
            );

            return change;
        }
    };
}

/**
 * Rule to enforce cells are always surrounded by a row.
 *
 * @param {Options} opts The plugin options
 * @return {Object} A rule to ensure cells are always surrounded by a row.
 */
function cellsWithinTable(opts) {
    return {
        match(node) {
            return (node.kind === 'document' || node.kind === 'block')
                && node.type !== opts.typeRow;
        },

        // Find child cells nodes not in a row
        validate(node) {
            const cells = node.nodes.filter((n) => {
                return n.type === opts.typeCell;
            });

            if (cells.isEmpty()) return;

            return {
                cells
            };
        },

        // If any, wrap all cells in a row block
        normalize(change, node, { cells }) {
            cells.forEach((cell) => {
                return change.wrapBlockByKey(cell.key, opts.typeRow, { normalize: false });
            });

            return change;
        }
    };
}

/**
 * Rule to enforce rows are always surrounded by a table.
 *
 * @param {Options} opts The plugin options
 * @return {Object} A rule to ensure rows are always surrounded by a table.
 */
function rowsWithinTable(opts) {
    return {
        match(node) {
            return (node.kind === 'document' || node.kind === 'block')
                && node.type !== opts.typeTable;
        },

        // Find child cells nodes not in a row
        validate(node) {
            const rows = node.nodes.filter((n) => {
                return n.type === opts.typeRow;
            });

            if (rows.isEmpty()) return;

            return {
                rows
            };
        },

        // If any, wrap all cells in a row block
        normalize(change, node, { rows }) {
            rows.forEach((row) => {
                return change.wrapBlockByKey(row.key, {
                    type: opts.typeTable,
                    data: {
                        align: createAlign(row.nodes.size)
                    }
                }, { normalize: false });
            });

            return change;
        }
    };
}

/**
 * @param {Options} opts The plugin options
 * @return {Object} A rule that ensures tables only contain rows and
 * at least one.
 */
function tablesContainOnlyRows(opts) {
    const isRow = (node) => node.type === opts.typeRow;

    return {
        match(node) {
            return node.type === opts.typeTable;
        },

        validate(table) {
            // Figure out invalid rows
            const invalids = table.nodes.filterNot(isRow);

            // Figure out valid rows
            const add = invalids.size === table.nodes.size ? [makeEmptyRow(opts)] : [];

            if (invalids.isEmpty() && add.length === 0) {
                return null;
            }

            return {
                invalids,
                add
            };
        },

        /**
         * Replaces the node's children
         * @param {List<Nodes>} value.nodes
         */
        normalize(change, node, {invalids = [], add = []}) {
            // Remove invalids
            invalids.forEach((child) => {
                return change.removeNodeByKey(child.key, { normalize: false });
            });

            // Add valids
            add.forEach((child) => {
                return change.insertNodeByKey(node.key, 0, child);
            });

            return change;
        }
    };
}

/**
 * @param {Options} opts The plugin options
 * @return {Object} A rule that ensures rows contains only cells, and
 * as much cells as there is columns in the table.
 */
function rowsContainRequiredColumns(opts) {
    const isRow = (node) => node.type === opts.typeRow;
    const isCell = (node) => node.type === opts.typeCell;
    const countCells = (row) => row.nodes.count((isCell));

    return {
        match(node) {
            return node.type === opts.typeTable;
        },

        validate(table) {
            const rows = table.nodes.filter(isRow);

            // The number of column this table has
            const columns = rows.reduce((count, row) => {
                return Math.max(count, countCells(row));
            }, 1); // Min 1 column


            // else normalize, by padding with empty cells
            const invalidRows = rows
                .map(row => {
                    const cells = countCells(row);
                    const invalids = row.nodes.filterNot(isCell);

                    // Row is valid: right count of cells and no extra node
                    if (invalids.isEmpty() && cells === columns) {
                        return null;
                    }

                    // Otherwise, remove the invalids and append the missing cells
                    return {
                        row,
                        invalids,
                        add: (columns - cells)
                    };
                })
                .filter(Boolean);

            return invalidRows.size > 0 ? invalidRows : null;
        },

        /**
         * Updates by key every given nodes
         * @param {List<Nodes>} value.toUpdate
         */
        normalize(change, node, rows) {
            rows.forEach(({ row, invalids, add }) => {
                invalids.forEach((child) => {
                    if (!Slate.Block.isBlock(child)) {
                        change.wrapBlockByKey(child.key, opts.typeCell, { normalize: false });
                        return;
                    }

                    change.setNodeByKey(child.key, opts.typeCell, { normalize: false });
                });

                Range(invalids.size, add).forEach((temp, index) => {
                    const cell = makeEmptyCell(opts);
                    change.insertNodeByKey(row.key, invalids.size + index , cell, { normalize: false });
                });
            });

            return change;
        }
    };
}


/**
 * @param {Options} opts The plugin options
 * @return {Object} A rule that ensures table node has all align data
 */
function tableContainAlignData(opts) {
    return {
        match(node) {
            return node.type === opts.typeTable;
        },

        validate(table) {
            const align = table.data.get('align', List());
            const row = table.nodes.first();
            const columns = row.nodes.size;

            return align.length == columns ? null : { align, columns };
        },

        /**
         * Updates by key the table to add the data
         * @param {Map} align
         * @param {Number} columns
         */
        normalize(transform, node, { align, columns }) {
            return transform.setNodeByKey(node.key, {
                data: Object.assign(node.data.toJS(), { align: createAlign(columns, align) })
            }, { normalize: false });
        }
    };
}

function makeEmptyCell(opts) {
    return Slate.Block.create({
        type: opts.typeCell,
        nodes: List([Slate.Text.create('')])
    });
}

function makeEmptyRow(opts) {
    return Slate.Block.create({
        type: opts.typeRow,
        nodes: List([makeEmptyCell(opts)])
    });
}


module.exports = makeSchema;
