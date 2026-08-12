# AlloMoney — Use Case Requirements

Requirements for the `allomoney-library`.

---

## How to Read a Use Case

**Scope** — Defines the location where the use case occurs. There are two
possible options: inside and outside of the system.

**Primary actor** — Somebody or something that can do something and has an aim.
The aim is the successful completion of the use case.

**Stakeholders & interests** — Someone or something that has an interest in the
behavior of the system.

**Initial conditions** — What conditions must be met before the use case can
start?

**Minimal guarantees** — If the main aim of the use case is not achieved, the
minimal guarantees execute — a few simple statements.

**Success guarantees** — A few simple statements that show the satisfaction of
the stakeholders and the primary actor.

**Triggers** — The event that started the use case.

**Main success scenario** — The aim of the primary actor and the interests of
the stakeholders are described here. Use simple sentences. For example:

```
1. Client enters an order number.
2. System calculates that the order number equals the winning number.
3. System registers Client as the winner.
```

**Extensions** — Failures or other action chains that lead to successful
completion of the use case. Show alternative paths. For example:

```
1.1.a.          alternative case in the “successful” chain
1.1.b. (failure)     alternative case in the “failure” chain that must
                     achieve at least the minimal guarantees
1.1.c. (failure) (*) alternative case in the “failure” chain that must
                     achieve at least the minimal guarantees; could appear
                     at any time
1.1.c.1. (success)   use case is over successfully
```

**Frequency** — How often does the use case run?

**Business rules** — Description of business rules, algorithms, mocks, etc.

**Open questions** — Questions for the business or development team that should
be discussed.

---

## Sub-Function Level Use Cases

### Glossary

- **Component** — an Angular component from `@projects/allomoney-library/src/lib`.
- **Demo App** — an Angular application from `@projects/demo`.
- **User** — a human who works with the Demo App.

---

### UC-1: Show Sankey Diagram By Default

**Scope:** `@projects/allomoney-library/src/lib/allomoney-sankey-diagram`

**Primary actor:** Demo App displays Component based on the provided data JSON in
the `dataSource` property of Component.

**Stakeholders & interests:** Component is a feature-rich Sankey diagram.
Component shows money flow.

**Initial conditions:** Component is rendered and enabled; Demo App is subscribed
to its outputs.

**Minimal guarantees:** Component shows at least the placeholder (business rule 4)
and logs errors to the browser console if applicable.

**Success guarantees:** Component shows correctly parsed JSON as a Sankey diagram
with default parameters (business rule 1).

**Triggers:** Demo App shows Component. The `dataSource` property of Component can
be set.

**Main success scenario:**

```
1.     Demo App sets the dataSource property.
1.1.   Component successfully validates the provided JSON.
1.1.1. Component draws the Sankey diagram based on business rule 2.
       The use case is over.
```

**Extensions:**

```
1.1.a    Component determines during validation that the JSON is one of the
         Empty States (business rule 5).
1.1.a.1  Component draws the placeholder based on business rule 4.
         The use case is over.
1.1.b    Component determines during validation that the JSON is invalid
         (business rule 3).
1.1.b.1  Component draws the Sankey diagram based on business rule 3.
1.1.b.2  Component writes the error to the browser console.
         The use case is over.
```

**Business rules:**

**1. Default parameters**

- The `orientation` property of `SankeyData` equals `horizontal`.
- The default theme is `light`.

**2. JSON-based Sankey diagram**

Examples live in
`@projects/allomoney-library/src/lib/allomoney-sankey-diagram/models`. The order
of the names, values, and colors is important.

```json
{
  "nodes": [
    {"id": 0, "name": "account 0", "value": 10.00},
    {"id": 1, "name": "node 1"},
    {"id": 2},
    {"id": 3, "name": "Invest node 3", "value": 10.00},
    {"id": 4, "name": "Questrade ARTG"}
  ],
  "links": [
    {"source": 0, "target": 2, "value": 5.50},
    {"source": 0, "target": 3, "value": 4.50},
    {"source": 1, "target": 2, "value": 0.50},
    {"source": 2, "target": 4, "value": 6.00},
    {"source": 3, "target": 4, "value": 5.00}
  ]
}
```

`nodes[i].value` is the total deposit for that node. If it is not set, it equals
the sum of all `links.value` whose `target` equals this `node.id`. Example
diagrams: `@documents/examples/sankey-dark-theme.png` and
`@documents/examples/sankey-light-theme.png`. `nodes[i].value` must be placed in the middle of the node.
`links[i].value` must be placed in the middle of the link. Two or more `links[i].value` cannot overlap on Component. 

`nodes[i].name` or `nodes[i].id` must be placed on the left side of the node for horizontal orientation 
and at the top of the node for vertical orientation. 

If a color is not directly specified for a node, use the following code to derive
a node color. The color must be unique for each node.

```ts
function generatePalette(count: number, theme: 'light' | 'dark'): string[] {
  const L = theme === 'dark' ? 0.84 : 0.82;   // high lightness → soft, luminous nodes
  const C = theme === 'dark' ? 0.105 : 0.075; // chroma: brighter on dark, more pastel on light
  const GOLDEN = 137.508;                      // even hue spread, no clustering
  const hue0 = 25;

  return Array.from({ length: count }, (_, i) =>
    `oklch(${L} ${C} ${(hue0 + i * GOLDEN) % 360})`
  );
}
```

**3. Validation rules**

Don't draw a node if:

- `id` is not a number
- `id` is null or undefined
- `id` is empty
- `value` is not null and not undefined and not a positive number
- `name` is a malicious string that can cause harm

Don't draw a link if:

- `source` is not a number
- `source` is null or undefined
- no valid node was found with `id` equal to `source`
- `source` equals `target`
- no valid node was found with `id` equal to `target`
- `value` is not a positive number
- `value` is null or undefined

Show the placeholder if:

- all nodes are invalid (none are drawn)

**4. Placeholders**

The placeholders are placed in
`@projects/allomoney-library/src/lib/allomoney-sankey-diagram/assets`.

**5. Empty States of JSON**

- `{}`
- `null`
- `undefined`
- `{nodes: []}` — even if this JSON has links and other elements
- `{nodes: null}` — even if this JSON has links and other elements
- `{nodes: undefined}` — even if this JSON has links and other elements

---

### UC-2: Hovering Over a Sankey Diagram Element

**Scope:** `@projects/allomoney-library/src/lib/allomoney-sankey-diagram`

**Primary actor:** User hovers over Component (Sankey diagram).

**Initial conditions:** The "Show Sankey Diagram By Default" use case is
successfully executed, regardless of whether default parameters are used.

**Minimal guarantees:** Component conforms to the initial conditions and logs
errors to the browser console, if applicable.

**Success guarantees:** User sees the entire chain (nodes and links) to which the
hovered element belongs.

**Triggers:** User hovers over an element of Component.

**Main success scenario:**

```
1. Component determines which of its elements do not belong to the chain that
   the hovered element belongs to.
2. Component makes these determined elements half-transparent.
3. User removes hovering from Component.
4. Component removes the translucency created in step 2.
```

**Extensions:**

```
1.a  There is only one chain and no other elements. The use case is over.
```

### UC-3: Edit Sankey Diagram Node
**Scope:** `@projects/allomoney-library/src/lib/allomoney-sankey-diagram`

**Primary actor:** User double-clicks on Component node or one of its elements (name, value).

**Initial conditions:** Show Sankey Diagram By Default use case is successfully executed, 
regardless of whether default parameters are used.

**Minimal guarantees:** Component conforms to Initial conditions and logs errors to the browser console, if applicable.

**Success guarantees:** User changed the node and these changes are applied to the data 
that was provided to the dataSource as [(dataSource)].

**Triggers:** User double-clicks on Component node or one of its elements (name, value).

**Main success scenario:**

```
1. Component successfully verifies User permission to edit the all node elements using business rule 1.
1.1. User enters a new node name and value.
2. User presses ENTER or clicks outside the editable area. Edit mode is still open.
3. Component successfully verifies entered data (business rule 2).
3.1. Component applies the entered data to dataSource and to the data that was provided 
to the dataSource as [(dataSource)]. Edit mode is closed.
```

**Extensions:**

```
1.a (failure) User cannot edit both name and value of the node. The use case is over.
1.b User cannot edit name of the node.
1.b.1 User enters value of the node.
1.c User cannot edit value of the node.
1.c.1 User enters name of the node.
3.a. Component verifies entered data and show validation error to User.
3.a.1.a User clicks Cancel or Esc. Edit mode closes. The use case is over.
3.a.1.b User makes correct changes. Step 3 from the main success scenario executes.
```

**Business rules:**

**1. CanEdit component properties**

- if `CanEditNodeName` is true than node[i].name can be edited by User
- if `CanEditNodeValue` is true than node[i].value can be edited by User

**2. Node elements validation rules**
- name must be string, null or undefined type
- value must be positive number, null or undefined
