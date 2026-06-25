# Public API Endpoints

The production BYOK desktop app does not require a hosted account API after
installation. The public website requires Supabase login before it returns the
installer URL.

## Public Config

```http
GET /api/public-config
```

Returns the public Supabase project URL and anon key used by the download page.
Never expose a Supabase service-role key here.

## Download

```http
GET /api/download?platform=windows&arch=x64
```

Requires `Authorization: Bearer <supabase-access-token>`.

Returns:

```json
{ "url": "https://..." }
```

Supported query parameters:

| Parameter | Values | Notes |
| --- | --- | --- |
| `platform` | `windows` | macOS/Linux installers are not published |
| `arch` | `x64` | 32-bit Windows is not packaged |

No payment, activation, profile, or credit APIs are part of the current free
BYOK release.
