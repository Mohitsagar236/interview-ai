function normalizeSupabaseUrl(value) {
    return String(value || '')
        .trim()
    .replace(/\/(rest\/v1|auth\/v1)\/?$/i, '')
        .replace(/\/+$/, '');
}

function supabaseConfig() {
    return {
        url: normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
        anonKey: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''
    };
}

function responseError(res, status, error) {
    return res.status(status).json({ error });
}

function sanitizeFileName(value) {
    return String(value || 'resume')
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'resume';
}

function inferFileExtension(fileName, contentType) {
    const name = String(fileName || '').toLowerCase();
    if (name.endsWith('.pdf')) return 'pdf';
    if (name.endsWith('.docx')) return 'docx';
    if (name.endsWith('.doc')) return 'doc';
    if (name.endsWith('.txt')) return 'txt';
    if (contentType === 'application/pdf') return 'pdf';
    if (contentType === 'application/msword') return 'doc';
    if (contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
    return 'bin';
}

function fileTypeAllowed(contentType, fileName) {
    const lowerName = String(fileName || '').toLowerCase();
    return [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
    ].includes(contentType) || lowerName.endsWith('.pdf') || lowerName.endsWith('.doc') || lowerName.endsWith('.docx') || lowerName.endsWith('.txt');
}

function decodeBase64(value) {
    return Buffer.from(String(value || ''), 'base64');
}

async function uploadResume({ url, serviceKey, fileName, contentType, resumeBase64 }) {
    const bucket = process.env.SUPABASE_RESUMES_BUCKET || 'careers-resumes';
    const extension = inferFileExtension(fileName, contentType);
    const safeName = sanitizeFileName(fileName).replace(/\.[^.]+$/, '');
    const objectName = `${Date.now()}-${safeName}.${extension}`;

    const uploadResponse = await fetch(`${url}/storage/v1/object/${bucket}/${encodeURIComponent(objectName)}`, {
        method: 'POST',
        headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': contentType || 'application/octet-stream',
            'x-upsert': 'true'
        },
        body: decodeBase64(resumeBase64)
    });

    if (!uploadResponse.ok) {
        const message = await uploadResponse.text().catch(() => 'Could not upload resume');
        throw new Error(message || 'Could not upload resume');
    }

    return {
        bucket,
        path: objectName
    };
}

async function insertApplication({ url, serviceKey, record }) {
    const response = await fetch(`${url}/rest/v1/careers_applications`, {
        method: 'POST',
        headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation'
        },
        body: JSON.stringify(record)
    });

    if (!response.ok) {
        const message = await response.text().catch(() => 'Could not save application');
        throw new Error(message || 'Could not save application');
    }

    return response.json();
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return responseError(res, 405, 'Method not allowed');
    }

    const { url, serviceKey } = supabaseConfig();
    if (!url || !serviceKey) {
        return responseError(res, 503, 'Supabase application storage is not configured');
    }

    const {
        fullName,
        email,
        role,
        portfolio,
        feedback,
        resumeName,
        resumeType,
        resumeBase64
    } = req.body || {};

    if (!fullName || !email || !role || !feedback || !resumeName || !resumeBase64) {
        return responseError(res, 400, 'Missing required application fields');
    }

    if (!fileTypeAllowed(resumeType, resumeName)) {
        return responseError(res, 400, 'Unsupported resume file type');
    }

    const resume = await uploadResume({
        url,
        serviceKey,
        fileName: resumeName,
        contentType: resumeType,
        resumeBase64
    });

    const savedAt = new Date().toISOString();
    const record = {
        full_name: String(fullName).trim(),
        email: String(email).trim(),
        role: String(role).trim(),
        portfolio: String(portfolio || '').trim(),
        feedback: String(feedback).trim(),
        resume_bucket: resume.bucket,
        resume_path: resume.path,
        resume_name: String(resumeName).trim(),
        resume_type: String(resumeType || '').trim(),
        status: 'new',
        submitted_at: savedAt
    };

    const result = await insertApplication({ url, serviceKey, record });
    return res.status(200).json({ ok: true, application: result?.[0] || record });
}