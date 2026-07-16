# Static code graph

Open `graph.html` in a browser to explore the interactive graph. `graph.json` contains the raw data and `GRAPH_REPORT.md` the automatic report.

## Scope

The corpus contains only Python, JavaScript, C and header sources: 285 nodes, 416 edges and 18 communities. The most connected nodes are `MacroPad`, `main()` and `raw_handle()`, along with the USB descriptor structures.

The most useful connections found are:

- the `DeviceTests` tests use the `MacroPad` API;
- `NEO_update()` crosses the boundary between the application firmware and the NeoPixel driver;
- `raw_handle()` links the application protocol and the HID transport;
- `MacroPad` links the web server and the physical device.

## Quality and limitations

The extraction reports 91% extracted edges and 9% inferred, with no import cycles. However, the raw diagnostics flagged **40 edges with dangling endpoints** and 103 nodes with at most one connection. These are mostly generic USB structures, generated timing primitives, and external symbols present in the CH55x headers. For this reason, the graph should be used for orientation, while the pinout and protocol must be verified against the code and the datasheet.
