############################ datasource-utils.ts ############################

## Purpose

This file contains small helper functions for reading information from Experience Builder datasources.
The widget uses these helpers so the main runtime file does not need to repeatedly check whether a datasource has a schema, whether records have loaded, or whether record access methods are available.

## What this file does

This file reads the available field names from a datasource schema.
It returns the records currently loaded in an Experience Builder datasource.
It counts the loaded records by reusing the same loaded-record helper.



## Function dictionary

### `getAvailableFieldNamesFromDataSource`
Reads the datasource schema and returns the field names available to the widget.
If the schema or fields are not available yet, it returns an empty list instead of failing.


### `getLoadedRecordsFromDataSource`
Returns the records currently loaded in the datasource.
If the datasource cannot return records, or no records have loaded yet, it returns an empty list.


### `getLoadedRecordCountFromDataSource`
Returns the number of currently loaded records.
This uses `getLoadedRecordsFromDataSource`, so it follows the same safe fallback behaviour.










############################ feature-attributes.ts ############################

## Purpose

This file handles optional feature-attribute panels.
Feature-attribute panels are linked records shown under a selected feature row. They are useful for descriptive supporting information. They are not used for editing and they are not treated as the source of truth.

## What this file does

This file creates a stable state key for each feature and feature-attribute panel combination.
It can split that state key back into the original feature UID and feature-attribute key.
It queries a configured linked table for records that match the selected feature UID.
It converts linked table records into simple display rows using the fields configured in the field-map JSON.



## Behaviour

When the selected feature UID is blank, the query returns an empty successful result.
When a linked table query succeeds, the matching records are returned as display values using the configured field labels.
When a linked table query fails, the function logs the failure and returns a user-facing error message for that feature-attribute panel.


## Function dictionary

### `getFeatureAttributeStateKey`
Creates a stable key from `feature_uid` and the feature-attribute configuration key.
This lets the widget track which linked panels are expanded, loading, or in error for each feature.


### `parseFeatureAttributeStateKey`
Splits a feature-attribute state key back into the original `feature_uid` and feature-attribute key.
If the key is not in the expected format, it returns blank values.


### `queryBasicLinkedTableFeatureAttributes`
Queries the configured linked table for records where the configured feature UID field matches the selected feature UID.
It returns display-ready records using the configured display fields.










############################ field-map.ts ############################

## Purpose

This file defines and validates the field-map JSON structure.
The field map is the contract between a dataset and the generic widget runtime. It tells the widget which fields build the hierarchy, which field is the stable identity, which fields can be filtered, which related summaries can be displayed, and which linked panels can be opened.


## What this file does

This file defines the expected shape of the field-map JSON.
It checks that required sections exist.
It checks that required text values are not blank.
It checks that keys are unique where they need to be unique.
It checks that only supported formats and related operations are used.
It checks that configured main-datasource fields exist in the selected datasource when field information is available.


## Field-map rules enforced here

`hierarchyFields` must contain at least one entry.
Each hierarchy field must include `key`, `fieldName`, and `label`.
Each hierarchy field key must be unique.
`featureLabelFieldKey` must match one configured hierarchy field key.
`selectableFieldKey`, when supplied, must also match one configured hierarchy field key.
`identityFields.feature_uid.fieldName` must be supplied.
Append field keys must be unique within their hierarchy field.
Related summary keys must be unique within their hierarchy field.
Only `sum` is currently supported for related summaries.
Related breakdown keys must be unique within their hierarchy field.
Related breakdown group fields must include at least one grouping field.
Resolved related-breakdown filters must include the option source, display field, value field, resolve source, resolve value field, resolve join field, and target field.
Feature attributes must use the supported `basicLinkedTable` type.
Supported display formats are `text`, `date`, `datetime`, and `number`.

## Function dictionary

### `parseStructureFieldMap`
Parses the JSON text entered in the widget settings.
If the JSON is missing, invalid, or incomplete, it returns a clear error message and no field map.
If the JSON passes validation, it returns the parsed field map.

### `getConfiguredFieldNamesFromFieldMap`
Returns the main-datasource field names used by the field map.
This includes hierarchy fields, append fields, child-count breakdown fields, main join fields for related summaries and breakdowns, target fields for resolved filters, and the configured feature UID field.

### `validateFieldMapAgainstAvailableFields`
Compares the configured field names against the selected datasource field names.
It returns the configured fields, available fields, missing fields, and a pass/fail result.









############################ selection-utils.ts ############################

## Purpose

This file contains helper functions for feature identity, selection, map-click resolution, and safe text matching.
The widget uses these helpers to keep tree selection, datasource selection, and map selection aligned without hard-coding a particular dataset name or layer name.

## What this file does

This file normalises text and URLs for safer comparison.
It escapes text before it is placed in a SQL where clause.
It reads field values from Experience Builder records and ArcGIS feature attributes.
It resolves configured field names when ArcGIS returns qualified field names.
It checks whether a clicked map layer appears to match the configured datasource.
It finds and selects loaded records by feature UID.
It clears shared Experience Builder datasource selection when the widget needs local state to remain in control.
It resolves a feature UID from a map hit result.


## Behaviour

The configured feature UID is treated as the stable feature identity.
When a loaded record with the requested feature UID cannot be found, the selection helper returns an error message instead of selecting the wrong row.
When a clicked map feature already contains the configured feature UID, the UID is used directly.
When a clicked map feature does not contain the configured feature UID, the function attempts a small layer query using the object ID to retrieve the UID field.
If the UID cannot be resolved, the function returns a blank value.

## Function dictionary

### `normaliseText`
Converts a value to trimmed lower-case text.
This is used when comparing datasource IDs, titles, labels, and other text values.

### `normaliseUrl`
Converts a URL-like value to trimmed lower-case text and removes trailing slashes.
This makes URL comparison less fragile.

### `escapeSqlValue`
Escapes single quotes before a text value is used in an ArcGIS SQL clause.

### `getRecordStringValue`
Reads a field from an Experience Builder record and returns it as trimmed text.

### `getAttributeValueByFieldName`
Reads a value from ArcGIS feature attributes.
It first checks the exact field name, then checks for matching qualified field names.

### `getLayerFieldName`
Finds the actual layer field name that matches a requested field name.
This helps when ArcGIS returns fields with table or layer prefixes.

### `isConfiguredFeatureLayerMatch`
Checks whether a map layer appears to match the configured datasource.
It compares datasource ID, datasource URL, and datasource label where available.

### `getFeatureUidFromRecord`
Reads the configured feature UID value from an Experience Builder record.

### `findLoadedRecordByFeatureUid`
Finds a loaded record with a matching feature UID.

### `selectLoadedRecordByFeatureUid`
Selects a loaded datasource record by feature UID.
If no matching record or valid record ID is found, it returns an error message.

### `getSelectedFeatureUidFromDataSource`
Reads the feature UID from the first selected record in a datasource.

### `clearDataSourceSelection`
Clears shared Experience Builder datasource selection.
This helps prevent selection loops between the widget, datasource, and map.

### `resolveFeatureUidFromHitResult`
Attempts to resolve the configured feature UID from a clicked map feature.
It first checks the clicked feature attributes directly. If needed, it queries the clicked layer by object ID and reads the configured UID field from the query result.









############################ structure-model.ts ############################

## Purpose

This file converts flat datasource records into the nested tree model used by the widget.
It is the main structure-building file. It takes records from the active datasource and the parsed field map, then creates `StructureNode` objects for the tree.

## What this file does

This file reads raw and text values from datasource records.
It handles ArcGIS field names that may be returned as exact names or qualified names.
It skips records that do not have a stable feature UID.
It skips records that are missing required hierarchy values.
It allows optional hierarchy levels to be skipped when they are blank.
It creates stable node keys for branch and feature rows.
It determines which hierarchy level should become the selectable feature row.
It attaches append fields and related summary values to the correct rows.
It stores selected feature field values needed for child-count breakdowns.
It sorts tree nodes using numeric-aware text ordering.


## Behaviour

The configured feature UID is required. A record without a feature UID is ignored.
Required hierarchy fields must have values. If a required hierarchy field is blank, the record is ignored.
Optional hierarchy fields may be skipped when blank, allowing the same dataset to support variable-depth hierarchy paths.
The selectable feature row is controlled by `selectableFieldKey` when that field exists in the active hierarchy path. If no selectable field is configured, the deepest active hierarchy field becomes selectable.
Related summary values are only attached to selectable feature rows.
Tree nodes are sorted using case-insensitive and numeric-aware ordering, so values such as `2` and `10` sort in a human-friendly way.

## Function dictionary

### `buildStructureHierarchyFromRecords`
Builds the nested tree from datasource records.
This is the main exported function in this file.

### `getExpandableNodeKeys`
Returns the keys for nodes that have children.
The runtime uses this when it needs to expand branches automatically.

### `getNodePathKeysForFeatureUid`
Finds the path of node keys leading to a feature UID.
The runtime uses this when a feature is selected from the map, datasource, or tree and the widget needs to open the relevant branch.

### Internal helpers
The internal helpers read record data, resolve raw values, check whether values are meaningful, build node keys, find child nodes, sort nodes, determine selectable levels, and prepare appended display values.




