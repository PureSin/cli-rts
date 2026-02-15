# PLAN.md

## Project Purpose

CLI-RTS is a Real-Time Strategy Visualization tool that hooks into coding AI agents (like Claude Code) and visualizes them as units in a strategy game.

### Core Concept

- Read the current state of AI coding agents (starting with Claude Code)
- Treat each agent/subagent as a "unit" in an RTS-style visualization
- Map agent activities to different unit types based on what the agent is doing (e.g., exploring code, writing files, running tests)

### Open Questions

- How to hook into Claude Code's state (see Research section below)
- What unit types map to which agent activities
- What rendering approach to use for the visualization (terminal UI, web, etc.)

## Research

TODO: Investigate how other projects integrate with / read state from Claude Code.
