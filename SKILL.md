---
name: monitor-qor-skill
summary: Reusable workflow for implementing a modular Python + ECharts EDA QOR monitoring dashboard.
description: |
  This skill captures the end-to-end workflow for creating and extending the EDA QOR performance monitoring project in the Monitor workspace.
  Use it to structure work into separate backend files, frontend templates, JSON data persistence, and modern responsive UI design.
  Focus on:
  - tool configuration and per-tool JSON cache files
  - isolated user/tool data handling
  - Flask-style endpoint structure with JSON APIs
  - modern dashboard UI using CSS Grid/Flex and ECharts line charts
  - page flows: main dashboard, configuration page, tool analysis page

# When to use this skill
- Implementing new tool pages or chart views in `monitor2.3`.
- Adding or refactoring backend data caching, tool config management, and per-tool JSON storage.
- Designing the UI for main, configuration, and tool-specific pages with responsive layout.
- Building frontend interactivity for case selection, rule filtering, date selection, and comparison controls.

# Workflow
1. read the requirement and identify the three main user experiences:
   - main landing page with tool buttons and config summary
   - tool configuration page with add/edit flows
   - tool analysis page with runtime/memory/comparison charts.
2. define file separation early:
   - backend routes module(s)
   - data persistence module for JSON caches and tool configs
   - API module for chart data and comparison responses
   - template files for main/config/tool pages
   - static frontend assets for CSS, JS, and ECharts logic.
3. model persistence per tool and per user:
   - store tool definitions and metadata in a config JSON
   - create an isolated JSON cache per tool under `data/`
   - keep user-added data transient or session-scoped so refresh/reload does not show it.
4. implement the frontend pages using modern layout principles:
   - use CSS Grid for page structure and cards
   - use Flexbox for control rows and sidebars
   - apply glassmorphism/rounded cards and responsive breakpoints
   - integrate ECharts for line charts, tooltips, and comparison tables.
5. add clear endpoint contracts and data formats:
   - tool list and config retrieval
   - single-thread and multi-thread chart data APIs
   - custom curve data function hooks
   - comparison query and export endpoints.
6. validate and polish:
   - ensure data load on refresh only uses persisted JSON caches
   - ensure user-added additions appear only in the active view session
   - confirm no shared state across different tools or users
   - add comments and keep implementation idiomatic and maintainable.

# Quality criteria
- Separate concerns across files instead of one monolithic script.
- Use Python for backend implementation and Flask-style routing.
- Persist tool config and chart cache data into `data/` as JSON files.
- Use ECharts for runtime/memory/comparison line charts.
- Build a responsive layout with Grid/Flex and modern visual style.
- Implement tool config, date selection, case/rule filters, and compare mode controls.
- Keep user-added data isolated from browser refresh reloads.

# Example prompts
- "Create the Flask backend and frontend for a monitor2.3 tool configuration page with JSON persistence and ECharts charts."
- "Add a tool analysis page that supports runtime, memory, and comparison views with per-tool JSON cache storage."
- "Implement the monitor dashboard main page with tool buttons, config summary hover details, and modern CSS Grid layout."

# Related customizations
- Create a `.agent.md` or extended agent profile for `monitor2.3` work.
- Add a workspace `PROMPT.md` or `README.md` with standard page flow and data contract expectations.
- Define `monitor2.3` project scaffolding conventions in a separate `CONVENTIONS.md` file.
