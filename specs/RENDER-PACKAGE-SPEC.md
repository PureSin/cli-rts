# RENDER-PACKAGE-SPEC

## Goal

The goal is to allow the `cli-rts` renderer to be fully customizable via **Render Packs**. Similar to `peon`'s sound packs, these packs bundle assets (graphics, sounds, UI themes) into installable units that users can switch between.

The installer includes 5 curated packs by default, but the registry supports many more.

## Terminology

- **Pack**: A curated, installable bundle of assets (sounds, icons, theme config) with a `manifest.json`. Installed via `peon packs install <name>`.
- **Mod**: A local override or custom pack that hasn't been published to the registry.

## Pack Anatomy

A Render Pack is a directory containing a `manifest.json` and asset files.

**File Structure:**
```
render/public/packs/
└── <tla-pack-name>/
    ├── manifest.json       # Configuration (metadata, mappings)
    ├── thumbnail.png       # Preview image for UI
    ├── assets/
    │   ├── icons/          # Unit sprites/icons
    │   │   ├── unit.png
    │   │   └── building.png
    │   ├── sounds/         # Audio files
    │   │   ├── ready.ogg
    │   │   ├── work.ogg
    │   │   └── attack.ogg
    │   ├── ui/             # UI skin overrides (cursors, frames)
    │   └── map/            # Map backgrounds
    │       └── background.png
```

## Configuration (`manifest.json`)

The `manifest.json` defines how the pack maps to game entities. It supports inheritance (e.g., "Battlecruiser" might inherit from "Terran").

```json
{
  "name": "peon-orc",
  "version": "1.0.0",
  "description": "Warcraft III Orc Peon Theme",
  "author": "Blizzard / Community",
  "base": "default", 
  "assets": {
    "units": {
      "soldier": { "sprite": "assets/icons/grunt.png", "scale": 1.2 },
      "worker": { "sprite": "assets/icons/peon.png", "scale": 1.0 },
      "scout": { "sprite": "assets/icons/wolf_rider.png", "scale": 1.1 }
    },
    "sounds": {
      "ready": "assets/sounds/PeonReady1.ogg",
      "warcry": "assets/sounds/PeonWarcry1.ogg",
      "work": "assets/sounds/PeonYes1.ogg",
      "pissed": "assets/sounds/PeonPissed4.ogg"
    },
    "ui": {
      "cursor": "assets/ui/orc_gauntlet.png", 
      "font": "LifeCraft"
    },
    "map": "assets/map/background.png"
  }
}
```

## Available Packs

These 5 packs are included by default (needs to be implemented):

0. Default UI: Icons

1.  **Peon (Warcraft III Orc)** 
    -   Worker: Peon
    -   Soldier: Grunt
    -   Announcer: Thrall / Peon style

2.  **Peasant (Warcraft III Human)**
    -   Worker: Peasant
    -   Soldier: Footman
    -   Announcer: Uther / Peasant style

3.  **Kerrigan (StarCraft)**
    -   Worker: Drone
    -   Soldier: Zergling
    -   UI: Organic/Zerg theme

4.  **Battlecruiser (StarCraft)**
    -   Worker: SCV
    -   Soldier: Marine
    -   Announcer: Adjutant / Battlecruiser Captain

## CLI Integration

Users manage packs via the CLI.

```bash
# List installed packs
peon packs list

# Switch to a specific pack
peon packs use glados
# Output: Switched render pack to 'GLaDOS (Portal)'

# Install a new pack from registry
peon packs install helldivers-2

# Create a new local pack template
peon packs create my-custom-pack
```

## Pack Verification

To ensure a pack is valid, the system performs the following checks:

1.  **Manifest Presence**: `manifest.json` must exist in the pack root.
2.  **Schema Validation**: The `manifest.json` must strictly adhere to the defined schema (e.g., valid JSON, required fields present).
3.  **Asset Integrity**: All files referenced in the `manifest.json` (images, sounds) must exist on disk.
4.  **Base Validity**: If the pack extends another (e.g., `"base": "default"`), the base pack must be installed and valid.

**Command:**
```bash
peon packs verify <pack-name>
# Output:
# [OK] Manifest valid
# [OK] Assets found (12/12)
# [OK] Base 'default' valid
# Pack 'peon-orc' is valid and ready to use.
```

## Listing Packs

Users can see all installed and valid packs using the list command. Invalid packs are marked.

**Command:**
```bash
peon packs list
```

**Output:**
```
INSTALLED PACKS
* default-ui (v1.0.0) [Active]
  peon-orc (v1.0.0)
  peasant-human (v1.0.0)
  kerrigan-zerg (v1.0.0)

Use 'peon packs use <name>' to switch.
```

## Enabling a Pack

To switch the active render pack, use the `use` command. This updates the global user configuration to point to the selected pack directory. The renderer (if running) should hot-reload the new assets.

**Command:**
```bash
peon packs use kerrigan-zerg
# Output: Switched render pack to 'Kerrigan (StarCraft) v1.0.0'
```

