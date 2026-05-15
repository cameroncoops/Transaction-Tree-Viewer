############################ FeatureAttributes.tsx ############################

## Purpose

This file renders optional linked feature-attribute panels under a feature row.
These panels are used to show related descriptive records for a selected feature. They are loaded on demand and are intended for viewing only.

## What this file does

This component displays one expandable row for each configured feature-attribute panel.
It shows loading, error, empty, and populated states.
It renders configured display fields as label-and-value rows.
It asks the runtime to expand or collapse a panel when the user clicks the toggle or panel label.


## Behaviour

If no feature attributes are configured, the component renders nothing.
When a panel is collapsed, only the panel label is shown.
When a panel is expanded and loading, the component shows `Loading...`.
When the query fails, it shows the supplied error message.
When the query succeeds but no records are found, it shows `No records found.`
When records are found, it displays each configured label and value.

## Function dictionary

### `FeatureAttributes`
Renders the expandable feature-attribute panels for one feature.

### `getTreeToggleIcon`
Returns `-` for expanded panels and `+` for collapsed panels.








############################ FieldMapPanel.tsx ############################

## Purpose

This file renders a configuration summary for the current field-map JSON.
It helps the user or maintainer see how the widget has interpreted the configured hierarchy, identity field, feature labels, selectable field, append fields, feature attributes, and datasource field validation.

## What this file does

This component displays field-map parse errors.
It lists the configured hierarchy fields.
It shows optional hierarchy fields and filter-enabled hierarchy fields.
It lists append fields under their hierarchy field.
It shows the configured feature label key.
It shows the configured selectable field key, or confirms that the final hierarchy field will be used.
It shows the configured feature UID field.
It lists configured feature-attribute panels.
It shows datasource field validation results when validation information is available.


## Behaviour

If the field-map JSON has an error, the error message is shown.
If the field map is valid, the configured structure is displayed.
If no feature attributes are configured, the panel explicitly says so.
If datasource fields have not loaded yet, the panel says no datasource fields have been loaded.
If validation passes, the panel says all configured fields were found.
If validation fails, the panel lists the missing configured fields.

## Function dictionary

### `FieldMapPanel`
Renders the configured field-map summary and datasource field validation status.








############################ StructureTree.tsx ############################

## Purpose

This file renders the interactive hierarchy tree.
It takes the prepared `StructureNode` hierarchy from the runtime and turns it into visible tree rows, feature rows, branch rows, related breakdown rows, child-count summaries, appended display values, and feature-attribute panels.

## What this file does

This component renders the main hierarchy.
It shows expandable and collapsible branch rows.
It shows selectable feature rows.
It shows appended display values beside tree labels.
It shows child counts and optional count breakdowns on group rows.
It supports top-level isolation controls.
It shows branch expansion controls.
It renders lazy-loaded related breakdown rows under expanded feature rows.
It renders linked feature-attribute panels under feature rows.
It reports user actions back to the runtime through callback functions.

## What this file does not do

This component does not build the original hierarchy from datasource records.
It does not query related breakdown records.
It does not query feature-attribute records.
It does not decide which records are visible after filtering.
It renders the current tree state that the runtime gives it.

## Behaviour

If the hierarchy is empty, the component shows `No structure records loaded.`
Group rows display their configured label and value.
When child counts are enabled, group rows also show the number of descendant feature rows.
When a child-count breakdown field is configured, group rows show the count split by that field. Blank breakdown values are shown as `Unknown`.
Feature rows can be clicked. The runtime receives the selected `StructureNode`.
Feature rows can show appended values, related summary values, and linked feature-attribute panels.
If a feature has configured related breakdowns, expanding the feature can trigger the runtime to load those rows.
Related breakdown rows are displayed as child rows under the feature.
Top-level rows can be isolated when the runtime supplies an isolation handler.

## Function dictionary

### `StructureTree`
Renders the full visible tree.

### `renderNode`
Renders a normal hierarchy node, including group rows and feature rows.

### `renderRelatedBreakdownArea`
Renders the lazy-loaded related breakdown area under an expanded feature node.

### `renderRelatedNode`
Renders a related breakdown node.

### `renderAppendedDisplayValues`
Formats and renders append-field and related-summary values beside a row label.

### `formatDisplayValue`
Formats text, number, date, and datetime display values.

### `getGroupNodeDisplayLabel`
Builds the display text for a group row.

### `getGroupNodeDisplayText`
Builds group row text, including child counts where configured.

### `getGroupNodeBreakdownText`
Builds the breakdown text for child counts.

### `collectDescendantFeatureDetails`
Collects descendant feature identities and optional breakdown values so group rows can show counts without double-counting features.

### `getSortedBreakdownEntries`
Sorts child-count breakdown entries by label or count.

### `getFeatureFieldValue`
Reads stored feature field values from a tree node.

### `getBreakdownValueText`
Returns readable breakdown text and converts blank values to `Unknown`.

### `getFeatureIdentityKey`
Returns a stable identity key for counting feature rows.

### `getHierarchyFieldForNode`
Finds the field-map hierarchy field that matches a tree node.

### `getTreeToggleIcon`
Returns the expanded or collapsed tree icon.

### `hasConfiguredRelatedBreakdowns`
Checks whether a feature node has related breakdown configuration.

### `getNodeIndent`
Calculates row indentation.

### `getNodeTextStyle`
Returns the visual style for a row based on depth, selection state, and related-node status.

### `getSelectedFeatureRowStyle`
Returns the visual style for a selected feature row.

### `getConnectorGuideStyle`
Returns the vertical connector style between tree rows.

### `getConnectorElbowStyle`
Returns the horizontal connector style between a connector line and a row.








############################ WidgetStatusPanel.tsx ############################

## Purpose

This file renders the widget status panel.
The status panel gives a quick summary of whether the active datasource is connected, whether a map widget is connected, whether features are loading, whether a load error has occurred, and how many records are currently loaded.

## What this file does

This component shows the datasource connection state.
It shows the map widget connection state.
It shows the loaded record count.
It shows a loading message while features are loading.
It shows a load error message when one is supplied.


## Behaviour

When features are loading, the panel shows `Loading features...`.
When a load error exists, the panel shows that error.
When there is no load error, the panel shows datasource status, map status, and loaded record count.
The record count is formatted using Australian number formatting.

## Function dictionary

### `WidgetStatusPanel`
Renders the runtime connection and loading status summary.
