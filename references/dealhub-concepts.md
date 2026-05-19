# DealHub CPQ — Core Concepts

## Object hierarchy
```
Tenant
  └── Version (DRAFT | ACTIVE)
        └── Playbook
              └── Group (regular=Q&A | repeatable=table)
                    └── Question
                          └── Rules (hidden | readonly | presentation)
```

## Versions
- Always mutate DRAFT versions. Never touch ACTIVE.
- If only ACTIVE exists → tell user to create a DRAFT first.
- `versionActivationStatus`: NONE | IN_PROGRESS | DONE

## Playbooks
- Loaded via `GET /playbook?playbookGUID=...`
- Saved via `POST /playbook` (full object round-trip)
- `solutions` = groups array; `solutionAttributes` = questions array inside each group

## Groups
- `groupType`: QUESTIONS_GROUP (regular) | REPEATABLE_GROUP (table)
- `repetitive: true` = repeatable
- Null-guid groups returned by GET must be filtered before POST (EU1 gotcha)

## Questions
- `type` internal values: "Text answer" | "Numeric answer" | "Text list" | "Date" | "Calculated answer"
- `TYPE_MAP`: text→"Text answer", numeric→"Numeric answer", text_list→"Text list", date→"Date", date_formula→"Date", calculated→"Calculated answer", textarea→"Text answer"
- `hiddenRule`: expression string, default "false"
- `readOnlyRule`: expression string, default "false"
- `showMode`: "ALWAYS" | "RULE_BASED"
- `presentationRules`: array of rule objects when showMode=RULE_BASED

## Numeric questions
value array = [{id: min, text: min}, {id: max, text: max}]
- No lower bound sentinel: "5e-324"
- No upper bound sentinel: "" (empty string)
- Never set value=[] on numeric — breaks Excel uploads

## Text list questions
value array = [{id: '"Option"', text: '"Option"'}] — values wrapped in double quotes
- defaultValue also wrapped: '"Option"'
- textListValues passed to tools must be plain text (no HTML, no //, no extra quotes)

## Rules syntax
- Reference a question: [GroupName.QuestionName]
- Example: [CustomerInfo.Country] == "USA"
- Boolean operators: && || !
- Comparison: == != > < >= <=
- Text list functions: IncludesANY([G.Q], "a","b") | IncludesALL | IncludesEXACT
- Math: MAX(a,b) MIN(a,b) Math.ceil(x) Math.floor(x)

## Save gotchas (EU1)
Before POST /playbook:
1. Filter null-guid solutions: `solutions.filter(s => s.guid !== null || s.isNewSolution)`
2. Delete: syncProductsToSfRule, syncDocsToSfRule, collapseQuoteSettingsRule
3. CSRF-Token header required (extracted from DEALHUB_PLAY_SESSION JWT)
