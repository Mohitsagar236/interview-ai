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

function text(value) {
    return String(value || '').trim();
}

function booleanValue(value) {
    return value === true || value === 'true' || value === 'on' || value === 1 || value === '1';
}

function objectValue(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeApplicationData(body) {
    const source = objectValue(body.applicationData);
    const resume = objectValue(source.resume);
    const metadata = objectValue(source.metadata);

    return {
        fullName: text(body.fullName || source.fullName),
        email: text(body.email || source.email),
        phoneNumber: text(body.phoneNumber || body.phone || source.phoneNumber || source.phone),
        currentLocation: text(body.currentLocation || body.location || source.currentLocation || source.location),
        role: text(body.role || source.role),
        linkedIn: text(body.linkedIn || source.linkedIn),
        github: text(body.github || source.github),
        portfolioWebsite: text(body.portfolioWebsite || body.portfolio || source.portfolioWebsite || source.portfolio),
        yearsOfExperience: text(body.yearsOfExperience || body.experience || source.yearsOfExperience || source.experience),
        highestQualification: text(body.highestQualification || body.qualification || source.highestQualification || source.qualification),
        currentCompanyOrCollege: text(body.currentCompanyOrCollege || body.currentOrg || source.currentCompanyOrCollege || source.currentOrg),
        expectedJoiningDate: text(body.expectedJoiningDate || body.joiningDate || source.expectedJoiningDate || source.joiningDate),
        availability: text(body.availability || source.availability),
        techSkills: text(body.techSkills || body.skills || source.techSkills || source.skills),
        whyJoin: text(body.whyJoin || source.whyJoin),
        proudProject: text(body.proudProject || source.proudProject),
        improveArea: text(body.improveArea || body.improvementArea || source.improveArea || source.improvementArea),
        whyHire: text(body.whyHire || source.whyHire),
        anythingElse: text(body.anythingElse || source.anythingElse),
        confirmAccuracy: booleanValue(body.confirmAccuracy ?? source.confirmAccuracy),
        resume: {
            name: text(body.resumeName || resume.name),
            type: text(body.resumeType || resume.type),
            size: Number(body.resumeSize || resume.size || 0) || null
        },
        metadata: {
            sourcePage: text(body.sourcePage || metadata.sourcePage || 'careers.html'),
            submittedAt: text(metadata.submittedAt),
            userAgent: text(body.userAgent || metadata.userAgent),
            language: text(body.language || metadata.language),
            timezone: text(body.timezone || metadata.timezone)
        }
    };
}

function formatApplicationFeedback(applicationData) {
    return [
        `Phone: ${applicationData.phoneNumber}`,
        `Current Location: ${applicationData.currentLocation}`,
        `LinkedIn: ${applicationData.linkedIn}`,
        `GitHub: ${applicationData.github}`,
        `Portfolio Website: ${applicationData.portfolioWebsite}`,
        `Years of Experience: ${applicationData.yearsOfExperience}`,
        `Highest Qualification: ${applicationData.highestQualification}`,
        `Current Company / College: ${applicationData.currentCompanyOrCollege}`,
        `Expected Joining Date: ${applicationData.expectedJoiningDate}`,
        `Availability: ${applicationData.availability}`,
        `Tech Skills: ${applicationData.techSkills}`,
        `Why Interview AI: ${applicationData.whyJoin}`,
        `Proud Project: ${applicationData.proudProject}`,
        `Area to Improve: ${applicationData.improveArea}`,
        `Why Hire: ${applicationData.whyHire}`,
        `Anything Else: ${applicationData.anythingElse}`,
        `Confirmed Accurate: ${applicationData.confirmAccuracy ? 'Yes' : 'No'}`
    ].join('\n');
}

function isSchemaColumnError(message) {
    return /PGRST204|schema cache|column .* does not exist|Could not find .* column/i.test(String(message || ''));
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

async function insertApplicationWithFallback({ url, serviceKey, record, fallbackRecord }) {
    try {
        return await insertApplication({ url, serviceKey, record });
    } catch (error) {
        if (!fallbackRecord || !isSchemaColumnError(error?.message)) {
            throw error;
        }

        return insertApplication({ url, serviceKey, record: fallbackRecord });
    }
}

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '12mb'
        }
    }
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return responseError(res, 405, 'Method not allowed');
    }

    const { url, serviceKey } = supabaseConfig();
    if (!url || !serviceKey) {
        return responseError(res, 503, 'Supabase application storage is not configured');
    }

    const body = req.body || {};
    const applicationData = normalizeApplicationData(body);
    const { fullName, email, role } = applicationData;
    const { resumeName, resumeType, resumeBase64 } = body;

    if (!fullName || !email || !role || !resumeName || !resumeBase64) {
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
    const readableFeedback = text(body.feedback) || formatApplicationFeedback(applicationData);
    const applicationSnapshot = {
        ...applicationData,
        resume: {
            ...applicationData.resume,
            bucket: resume.bucket,
            path: resume.path,
            name: text(resumeName),
            type: text(resumeType)
        },
        metadata: {
            ...applicationData.metadata,
            savedAt
        }
    };
    const record = {
        full_name: fullName,
        email,
        phone_number: applicationData.phoneNumber,
        current_location: applicationData.currentLocation,
        role,
        linked_in: applicationData.linkedIn,
        github: applicationData.github,
        portfolio_website: applicationData.portfolioWebsite,
        portfolio: applicationData.portfolioWebsite || applicationData.github || applicationData.linkedIn,
        years_experience: applicationData.yearsOfExperience,
        highest_qualification: applicationData.highestQualification,
        current_company_college: applicationData.currentCompanyOrCollege,
        expected_joining_date: applicationData.expectedJoiningDate || null,
        availability: applicationData.availability,
        tech_skills: applicationData.techSkills,
        why_join: applicationData.whyJoin,
        proud_project: applicationData.proudProject,
        improvement_area: applicationData.improveArea,
        why_hire: applicationData.whyHire,
        anything_else: applicationData.anythingElse,
        confirmed_accurate: applicationData.confirmAccuracy,
        feedback: readableFeedback,
        application_data: applicationSnapshot,
        resume_bucket: resume.bucket,
        resume_path: resume.path,
        resume_name: text(resumeName),
        resume_type: text(resumeType),
        resume_size: applicationData.resume.size,
        status: 'new',
        submitted_at: savedAt
    };
    const fallbackRecord = {
        full_name: fullName,
        email,
        role,
        portfolio: record.portfolio,
        feedback: `${readableFeedback}\n\nFull application data:\n${JSON.stringify(applicationSnapshot, null, 2)}`,
        resume_bucket: resume.bucket,
        resume_path: resume.path,
        resume_name: text(resumeName),
        resume_type: text(resumeType),
        status: 'new',
        submitted_at: savedAt
    };

    const result = await insertApplicationWithFallback({ url, serviceKey, record, fallbackRecord });
    return res.status(200).json({ ok: true, application: result?.[0] || record });
}
