# DealHub Advanced APIs

## Approval Workflows (Rule-Based only — General Workflow is manual UI)
```
POST /workflowSpecialRule/save
```
- Rule polarity: expression = "the scenario THAT NEEDS approval" (TRUE → routes to approval)
- Approvers: `MANAGER` is the ONLY valid dynamic keyword — `OWNER`/`ADMIN`/`USER` do NOT work in DealHub; use specific user GUIDs for non-manager approvers
- `MANAGER` gotcha: fails silently if submitting rep has no manager configured in User Management
- `approveStepFormat: 'ALL'` verified; `'ANY'` not HAR-confirmed
- Multi-step: academy describes but only single-step is HAR-verified

## Submit Validation (block-on-submit)
```
POST /submitValidationSettings
```
- `activeWhen` polarity: "the BAD scenario" (TRUE = block)
- Two types: `INTERNAL` (playbook answers only) | `EXTERNAL_QUERY` (depends on saved External Query)
- `<` operator gotcha: `<X` or `<[` treated as HTML tag — write reversed, use `>` form
- `%Group.Question%` works in `validationMessage` display strings ONLY — NOT in `activeWhen`
- Successful response = empty string — re-fetch to confirm

## External Queries (CRM data pulls)
```
POST /externalQuery/save (create/update)
GET  /externalQuery/list?versionGUID=...
```
POST body envelope:
```json
{
  "guid": null,
  "name": "...",
  "queryType": "CRM",
  "triggerType": "USER_REQUEST",
  "queryText": "...",
  "hiddenFields": [],
  "cacheExpirationHours": 0,
  "versionGUID": "...",
  "changeLogRecords": []
}
```
- `guid: null` = create; pass existing guid to update
- **CRITICAL: use `id` NOT `guid` from the POST response** for `customObjectQueryId` on a group. Using `guid` silently no-ops.
- CRM-specific query syntax: SOQL (Salesforce), JSON filter spec (HubSpot), FetchXML (Dynamics)
- HubSpot `IN` filter: comma-separated string `"a,b"` — NOT JSON array
- `/externalQuery/analyze` is NOT sufficient to verify SF field mapping — can return 200 even when field is unmapped

## Volume Discount Tables
```
POST /volumeDiscount/save
GET  /volumeDiscount/list?versionGUID=...
```
- Binding uses display `name` NOT internal `id` — sending `id` fails silently at runtime

## Subscriptions Group
14 canonical questions — question NAMES must match SOQL fieldIds exactly (including `__c`/`__r` suffixes).
- `automaticRunCustomObject: true` = auto-fires query on proposal open (canonical default)
- Sales Motion is a **proposal attribute** stamped by assignment templates — NOT a tag
- Tags are product-module classification (used in `apply_to_tags` pricing rules)

## Pricing Rules (Public Catalog API)
```
PATCH https://api.dealhub.io/api/v1/version/{versionId}/products_catalog?mode=UPDATE
Authorization: Bearer {token}
```
Per-product assignment + pricing edits. Different auth (Bearer) from admin API (cookies).

## Version Create / Duplicate
```
POST /versions/duplicate    (body: gzip JSON — format TBD from capture)
GET  /versions/sampleDuplication    (check duplication status)
```

## Products Catalog (Public API)
```
GET  https://api.dealhub.io/api/v1/version/{vid}/products_catalog
POST https://api.dealhub.io/api/v1/version/{vid}/products_catalog?mode=UPDATE
```
- Auth: Bearer token (NOT cookies)
- Use for per-product attribute edits at scale

## productsSettings (attribute schemas)
```
GET /productsSettings?versionGUID={vguid}
```
Returns Duration, Quantity factor schemas + Start Date, End Date proposal attribute definitions.

## Conditional rules on questions
- `step: null` for text_list questions
- `step: '1'` for numeric questions
- `guid: ''` (empty string) for NEW conditional rules — supplying your own GUID causes it to be dropped

## Group-level vs question-level CPR
- Group: `presentationRuleType: 'SOLUTION'`
- Question: `presentationRuleType: 'SOLUTION_ATTRIBUTE'`

## Known Coralogix errors
- `proposalSummaryPreview` 400 → vestigial inherited Output Document
- `recalculateDraftApprovalFlows` 400 with `( 0.0) / 0.0) +1` → `DATE_PRORATION_RELATIVE` in a non-repeatable group

## Output documents
- No emojis (utf8mb3 DB column rejects 4-byte UTF-8)
- `POST /outputdoc/createOrUpdate` — multipart
- `GET /outputData/edit?guid={docGuid}&versionGUID={vguid}` — load for editing
- `POST /outputData/save` — save (gzip JSON body)
