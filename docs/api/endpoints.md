# Public API Endpoints

The production BYOK desktop app does not require a hosted account API. The
public website exposes only a download redirect endpoint.

## Download

```http
GET /api/download?platform=windows&arch=x64
```

Redirects to the configured desktop installer URL.

Supported query parameters:

| Parameter | Values | Notes |
| --- | --- | --- |
| `platform` | `windows` | macOS/Linux installers are not published |
| `arch` | `x64` | 32-bit Windows is not packaged |

No account, payment, activation, profile, or credit APIs are part of the
current free BYOK release.
