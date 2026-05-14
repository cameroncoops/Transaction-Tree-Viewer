Transaction Tree Viewer Widget

README and behaviour notes

1. Purpose
The Transaction Tree Viewer is an ArcGIS Experience Builder runtime widget that visualises a transaction based dataset as a configurable, interactive hierarchy. It is intended to be dataset-neutral. Dataset-specific structure, labels, filters, related summaries, and breakdown rows are supplied through the field-map JSON rather than being hard-coded into the runtime file.

The widget is read-focused. It supports viewing, filtering, selecting, expanding, isolating, and synchronising map visibility. 
***It does not create, edit, retire, reactivate, or write transaction records.***

3. Runtime design
At setup, a fieldMapJson is entered to configure the dataset specific fields for presentation. At runtime, the widget parses the fieldMapJson into a StructureFieldMap. The parsed field map tells the widget how to identify features, build the tree, label rows, add display values, create filters, load related summaries, and lazy-load related breakdown rows.

The widget takes in a Active Spatial Transactions Feature Class and Active Attribue Transaction View Table, as datasource inputs. It can also take in additional related look up tables for presentation in the heirarchy. It supplies the records used for the tree, direct filter values, feature identity, and map selection targets. Additional datasources are treated as related or lookup sources. Their runtime keys are collected from the field map and assigned to datasource slots in first-seen order.

Main records are converted into StructureNode objects. Related summary values can be queried before the hierarchy is built so branch and feature rows can show totals. Related breakdown rows are loaded only when a feature or branch is expanded, avoiding a large upfront query across every child detail row.

5. Core rules
**Stable identity**	The configured identity field, usually feature_uid or a dataset-specific equivalent, is the stable feature identity used for tree lookup, related joins, selection, and map synchronisation. Labels such as bed numbers, room numbers, names, and types are not permanent identity.

**Active Spatial Transaction Feature Class & Active Attribue Transaction View Table**	The main datasources are expected to already represent the current active feature set and/or attributes. Retired or inactive records should be excluded upstream by the feature class, view, hosted view, or service definition. Active Spatial Transaction Feature Class is created as part of the ArcGIS Pro spatial sync process. The Active Attribue Transaction View Table is updated as transactions are added to the Attribute Transaction Table

**Related data is display data**	Related summaries, breakdowns, and linked panels help users navigate and understand the data. Editing belongs in separate transaction tools or purpose-built editing widgets.


7. JSON rules implemented
The field-map JSON is the contract between a dataset and the generic widget runtime. It should describe the dataset structure and avoid pushing dataset-specific assumptions into widget.tsx.

**fieldMapVersion**	Identifies the configuration shape expected by the parser.

**identityFields.feature_uid.fieldName**	Defines the stable feature identity field used for tree lookup, related joins, selection, and map synchronisation.

**hierarchyFields**	Defines the tree levels. Each entry needs a stable key, a source fieldName, and a user-facing label. Optional levels can be marked as optional.

**filter: true** on hierarchyFields	Creates a direct filter. Options are read from already-loaded main datasource records, and filtering is applied in memory.

**appendFields**	Adds extra display values to hierarchy rows without changing the hierarchy itself. Append fields can also become direct filters when filter: true is set.

**relatedSummaries**	Defines aggregate values from related datasources. The runtime currently supports sum-style summaries grouped by the configured related join field and mapped back to the main feature identity or join field.

**relatedBreakdowns**	Defines lazy-loaded child rows under feature nodes. A breakdown identifies the related datasource key, join fields, grouping fields, and the numeric field used for summed values.

**relatedBreakdowns.children**	Allows nested breakdown rows when configured. Child rows are built from grouped related records under the parent breakdown row.

**related breakdown filter**	The default related-breakdown filter queries the related datasource directly and resolves matching main records from that related table.

**filterType: "resolved"**	Uses one datasource for clean dropdown labels and another datasource to resolve the selected value back to main feature IDs or join values.

**featureAttributes**	Defines optional linked panels under feature rows. These panels are loaded on demand and should be used for descriptive related records, not source-of-truth editing.

**related datasource keys**	Keys are derived from summaries, breakdowns, filter option sources, and filter resolve sources. The Experience Builder datasource order must match the source-key order implied by the JSON.

**EXAMPLE JSON**
{
  "fieldMapVersion": 5,
  "hierarchyFields": [
    {
      "key": "parking_lot",
      "fieldName": "building",
      "label": "Parking Lot",
      "filter": true,
      "showChildCount": true,
      "childCountLabel": "Total",
      "childCountPrefixLabel": "Parking Lot",
      "childCountBreakdownFieldName": "status",
      "childCountBreakdownSort": "label"
    },
    {
      "key": "type",
      "fieldName": "type",
      "label": "Type",
      "filter": true,
      "showChildCount": true,
      "childCountLabel": "Total",
      "childCountPrefixLabel": "Type",
      "childCountBreakdownFieldName": "status",
      "childCountBreakdownSort": "label"
    },
    {
      "key": "bay",
      "fieldName": "room",
      "label": "Bay",
      "appendFields": [
        {
          "key": "status",
          "fieldName": "status",
          "label": "Status",
          "filter": true
        }
      ]
    }
  ],
  "featureLabelFieldKey": "bay",
  "selectableFieldKey": "bay",
  "identityFields": {
    "feature_uid": {
      "fieldName": "feature_uid",
      "label": "Feature UID"
    }
  }
}

8. Behaviour documentation
This section documents the main user or system actions accounted for by the widget and the expected reactions. This is the most useful behaviour documentation for future maintenance because it explains intent rather than restating syntax.


**Initial load**	The widget reads the configured JSON, resolves the main datasource and related datasource order, loads the main records, validates available fields where possible, and builds the first visible tree.

**Main datasource loads or changes** The widget refreshes the loaded records, rebuilds the tree from current records, recalculates expandable node keys, and refreshes summaries where configured. This is triggered when widget is paired with the Timeliner Widget for historical views.

**User changes a direct filter**	The selected filter value is stored, matching records are filtered in memory, the visible tree is rebuilt, and map visibility is updated from the active filters.

**User changes a related or resolved lookup filter**	The selected value is resolved through the configured related datasource path. The main records must satisfy every active resolved filter set before they remain visible.

**User clears one filter**	Only that filter value is cleared. The visible tree, available options, and map visibility are recalculated from the remaining active filters.

**User clears all isolation**	Top-level isolation is removed and map visibility returns to the currently configured filters.

**User selects a tree feature**	The widget stores the feature UID locally, opens the path to that row, clears shared datasource selection to prevent loops, highlights or zooms the map feature where possible, and keeps map visibility driven by filters rather than selection.

**External map or table selection changes**	The widget accepts the external selection when it resolves to a known feature UID, opens that feature in the tree, stores it locally, and clears the shared selection so Experience Builder does not keep feeding the same selection back.

**User clears selection**	The selected feature UID is cleared, the map highlight is removed, shared datasource selection is cleared, and map visibility remains based on filters and isolation.

**User expands a related breakdown row**	The widget queries the configured related datasource only for the required feature or branch, builds grouped child rows, and ignores the result if a newer expansion or filter request has superseded it.

**User expands a feature-attribute panel**	The widget loads the linked table records for that feature on demand and ignores stale results if the expanded panel state changes before the query completes.

**User clicks a map feature**	If the map feature resolves to a configured feature UID, the widget selects that feature locally and opens it in the tree. If no feature is found, the widget clears local selection.

**JSON is invalid or incomplete**	The widget reports a configuration message and avoids building an unreliable tree.

**Async request completes after a newer request**	The stale result is ignored using request IDs, preventing old queries from overwriting newer filter, datasource, or map states.

10. Notes for future maintenance
Keep the runtime code generic unless a dataset-specific rule has been explicitly accepted as reusable configuration. Treat the existing working behaviour as the exemplar. Before changing selection, filtering, datasource order, or map visibility, document the intended action and reaction.
When widget code changes are made, update the widget version string. Avoid broad workspace linting or full TypeScript checks unless deliberately requested; targeted review is safer for this project workflow.
