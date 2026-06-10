# Euro-Office Core Architecture & Data Flow Guide

This document provides a comprehensive technical overview of the Euro-Office multi-repository ecosystem, its infrastructure topology, and the end-to-end lifecycle of document data synchronization. It serves as the definitive onboarding guide for developers navigating the environment.

## 1. Workspace Topology & Sibling Repository Layout

The Euro-Office development workspace relies strictly on a standardized multi-repository filesystem layout. Because the Docker orchestration environment uses relative host mounts, developers must clone all core repositories as immediate siblings within the same parent workspace directory:

```text
~/repos/
  ├── DocumentServer/      # Main orchestrator containing Docker infrastructure & environment Makefiles.
  ├── web-apps/            # Frontend layer managing the UI components, toolbars, and views.
  ├── sdkjs/               # Core engine layer controlling document object models and canvas APIs.
  └── server/              # Backend service layer handling session management and file transformation.
```

---

## 2. Infrastructure Layer & Container Orchestration

When launching the environment using the orchestrator (`make local`), Docker Compose provisions an isolated stack designed to simulate a high-availability production architecture locally:

| Container Name | Service Role | Base Image & Port Mapping | Volume Semicolons & Intercepts |
| :--- | :--- | :--- | :--- |
| `nextcloud` | Storage & Auth Provider | PHP-Apache (`localhost:8081`) | Persists document assets and exposes Nextcloud OCC configuration binaries. |
| `eo` | Core Document Server | Node.js/C++/Nginx (`localhost:8080`) | Dynamically mounts host code paths into `/develop` for runtime modification. |
| `redis` | In-Memory Cache Store | Redis Native (Internal Network) | Manages hot collaborative session parameters and short-term websocket synchronization state. |
| `postgresql`| Relational Database | PostgreSQL (Internal Network) | Stores tracking tables, persistent settings, and transactional audit trails. |

---

## 3. End-to-End Data Flow Lifecycle

The interaction between the client browser, the main storage server (Nextcloud), and the modular document processor follows a fully decoupled asynchronous lifecycle:

```
+------------------+           (1) Generate Token & Open Document           +-------------------+
|                  | -----------------------------------------------------> |                   |
|  Nextcloud Web   |                                                        |   User Browser    |
|   Interface      | <----------------------------------------------------- |   (Client App)    |
|                  |               (4) Async Save Callback Webhook          +-------------------+
+------------------+                                                                  |
         ^                                                                            |
         |                                                                            | (2) Load App
         | (3) Safe Download Vector                                                   |     Assets & Engine
         v                                                                            v
+-----------------------------------------------------------------------------------------------+
|                                    DocumentServer Engine (eo)                                 |
|                                                                                               |
|   +-----------------------+           +-----------------------+           +---------------+   |
|   |    Nginx Web Server   |           |    docservice (Node)  |           | Converter (C++) |   |
|   +-----------------------+           +-----------------------+           +---------------+   |
+-----------------------------------------------------------------------------------------------+
```

### Step 1: Session Initialization & JWT Authentication
1. The user requests to open a document (`.docx`, `.xlsx`, `.pptx`) within the Nextcloud UI.
2. The Nextcloud Euro-Office application extension intercepts the file handle and builds a secure **JSON Web Token (JWT)** signed by the environment's `EO_JWT_SECRET`.
3. This payload encloses critical user access tokens, the document ID hash, specific permission rules (read/write limits), and a secure `CallbackUrl`.
4. Nextcloud embeds a responsive `iframe` pointing directly to the Document Server application route, injecting the JWT string into the initialization parameters.

### Step 2: Client Asset Loading & Hydration
1. The browser parses the `iframe` destination and pulls the client application layer from Document Server's internal Nginx instance.
2. The runtime loads user interface layouts from the production build tree inside `/var/www/euro-office/documentserver/web-apps/` along with the core command libraries from `sdkjs`.
3. The engine initializes the editor instance in the global context under the namespace structure of the `Asc` runtime object.

### Step 3: Collaborative Live Editing & Cache Synchronization
1. The Document Server backend node triggers an internal API call using the JWT parameters to stream the raw document binaries down from the Nextcloud storage server.
2. The internal server layer breaks the document model down into an atomic stream of individual changes (*changesets*).
3. As edits occur on screen, modifications bypass the main filesystem storage completely. Instead, they travel instantly as serializable frames via **WebSockets (Socket.io)** directly to `server/docservice`.
4. These changesets are stored incrementally inside the cache layer (Redis), allowing multiple cross-session users to view collaborative edits concurrently without write-locks.

### Step 4: Co-editing Session Closure & Callback Persistence
1. When the last active user drops connection or closes the browser tab, the Document Server initiates an internal 10-second conservation countdown.
2. The system triggers the binary execution engine (`server/converter`). This routine parses the base file document asset and applies the complete linear chain of cached *changesets* collected over the lifetime of the editing block.
3. Once the final binary structure is compiled, Document Server invokes an automated HTTP POST webhook targeting the `CallbackUrl` received in Step 1.
4. Nextcloud reads the incoming payload stream, validates the origin signature using the local secret, and overwrites the primary target storage file, incrementing the version tracking number.

---

## 4. Compilation Pipeline and Frontend Iteration

The application layer does not execute uncompiled HTML templates or raw script assets directly in production. This repository manages a localized internal Makefile map designed to speed up compilation workflows without rebuilding the native C++ layers:

```
[ Developer Source File Change ] -> (Ctrl+S) -> Host File Mount (WSL)
                                                       |
                                                       v
                                   [ docker compose exec eo make -f /Makefile <target> ]
                                                       |
                                                       v
                                  [ Target Directory Rebuild & Cache Refresh ]
```

### Core Developer Compilation Commands
When making system changes, use the explicit targets to skip full image recompilation loops:

* **Frontend Layout Changes (`web-apps`):** For UI modifications, button additions, or panel updates inside `.template` documents:
  ```bash
  docker compose exec eo make -f /Makefile web-apps
  ```
* **Engine & Logic Changes (`sdkjs`):** For document algorithms, selection event monitors, or API additions:
  ```bash
  docker compose exec eo make -f /Makefile sdkjs
  ```
* **Post-Compilation Protocol:** After any command run finishes successfully, always trigger a **Hard Refresh (`Ctrl + F5`)** or keep the developer tools console open with the "Disable Cache" flag active to flush the browser's aggressive RequireJS dependency cache.