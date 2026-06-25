# Public API Endpoints

The production BYOK desktop app does not require a hosted account API. The
public website exposes download, anonymous telemetry, and admin analytics
endpoints.

## Download

```http
GET /api/download?platform=windows&arch=x64
```

Tracks an anonymous download event and redirects to the configured desktop
installer URL.

Supported query parameters:

| Parameter | Values | Notes |
| --- | --- | --- |
| `platform` | `windows` | macOS/Linux installers are not published |
| `arch` | `x64` | 32-bit Windows is not packaged |

## Telemetry

```http
POST /api/telemetry
Content-Type: application/json
```

Accepted events:

| Event | Purpose |
| --- | --- |
| `app_launch` | Count anonymous desktop launches |
| `app_heartbeat` | Count active packaged app usage |
| `interview_session_start` | Count local interview session starts |
| `interview_session_end` | Count local interview session ends |

The desktop app sends an anonymous install ID, app version, OS/platform, and
event type only. It does not send transcripts, resumes, screenshots, API keys,
questions, answers, or settings.

## Admin Stats

```http
GET /api/admin-stats
Authorization: Bearer <ADMIN_TOKEN>
```

Returns aggregate downloads, app launches, active anonymous installs, interview
sessions, daily trends, and recent anonymous event metadata for `/admin.html`.

No account, payment, activation, profile, or credit APIs are part of the
current free BYOK release.
