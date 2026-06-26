const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, 'public');
const r2BaseUrl = (process.env.R2_PUBLIC_URL || 'https://pub-25ab7498cafd4a708df4eafca6fa14a3.r2.dev').replace(/\/+$/, '');
const version = process.env.APP_VERSION || '0.1.0';
const buildId = process.env.APP_BUILD_ID || '20260625-144629';

function supabaseConfig() {
  return {
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  };
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

function normalizeResumeFileName(value) {
  return String(value || 'resume')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'resume';
}

function inferResumeExtension(fileName, contentType) {
  const lowerName = String(fileName || '').toLowerCase();
  if (lowerName.endsWith('.pdf')) return 'pdf';
  if (lowerName.endsWith('.docx')) return 'docx';
  if (lowerName.endsWith('.doc')) return 'doc';
  if (lowerName.endsWith('.txt')) return 'txt';
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

function normalizeCareersApplicationData(body) {
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

function formatCareersApplicationFeedback(applicationData) {
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

function isSupabaseSchemaColumnError(message) {
  return /PGRST204|schema cache|column .* does not exist|Could not find .* column/i.test(String(message || ''));
}

async function uploadResumeToSupabase({ url, serviceKey, fileName, contentType, resumeBase64 }) {
  const bucket = process.env.SUPABASE_RESUMES_BUCKET || 'careers-resumes';
  const extension = inferResumeExtension(fileName, contentType);
  const safeName = normalizeResumeFileName(fileName).replace(/\.[^.]+$/, '');
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
    throw new Error(await uploadResponse.text().catch(() => 'Could not upload resume'));
  }

  return { bucket, path: objectName };
}

async function saveCareersApplicationToSupabase(record) {
  const { url } = supabaseConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

  if (!url || !serviceKey) {
    return { ok: false, status: 503, error: 'Supabase application storage is not configured' };
  }

  const resume = await uploadResumeToSupabase({
    url,
    serviceKey,
    fileName: record.resumeName,
    contentType: record.resumeType,
    resumeBase64: record.resumeBase64
  });

  const applicationData = normalizeCareersApplicationData(record);
  const submittedAt = new Date().toISOString();
  const readableFeedback = text(record.feedback) || formatCareersApplicationFeedback(applicationData);
  const applicationSnapshot = {
    ...applicationData,
    resume: {
      ...applicationData.resume,
      bucket: resume.bucket,
      path: resume.path,
      name: text(record.resumeName),
      type: text(record.resumeType)
    },
    metadata: {
      ...applicationData.metadata,
      savedAt: submittedAt
    }
  };

  const payload = {
    full_name: applicationData.fullName,
    email: applicationData.email,
    phone_number: applicationData.phoneNumber,
    current_location: applicationData.currentLocation,
    role: applicationData.role,
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
    resume_name: text(record.resumeName),
    resume_type: text(record.resumeType),
    resume_size: applicationData.resume.size,
    status: 'new',
    submitted_at: submittedAt
  };
  const fallbackPayload = {
    full_name: applicationData.fullName,
    email: applicationData.email,
    role: applicationData.role,
    portfolio: payload.portfolio,
    feedback: `${readableFeedback}\n\nFull application data:\n${JSON.stringify(applicationSnapshot, null, 2)}`,
    resume_bucket: resume.bucket,
    resume_path: resume.path,
    resume_name: text(record.resumeName),
    resume_type: text(record.resumeType),
    status: 'new',
    submitted_at: submittedAt
  };

  const insertPayload = async (body) => fetch(`${url}/rest/v1/careers_applications`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(body)
  });

  let response = await insertPayload(payload);
  if (!response.ok) {
    const message = await response.text().catch(() => 'Could not save application');
    if (!isSupabaseSchemaColumnError(message)) {
      throw new Error(message);
    }
    response = await insertPayload(fallbackPayload);
  }

  if (!response.ok) {
    throw new Error(await response.text().catch(() => 'Could not save application'));
  }

  return { ok: true };
}

async function verifySupabaseUser(req) {
  const { url, anonKey } = supabaseConfig();
  if (!url || !anonKey) {
    return { ok: false, status: 503, error: 'Download login is not configured' };
  }

  const token = bearerToken(req);
  if (!token) {
    return { ok: false, status: 401, error: 'Login required before download' };
  }

  const response = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    return { ok: false, status: 401, error: 'Invalid or expired login session' };
  }

  return { ok: true };
}

app.use(express.json({ limit: '12mb' }));
app.use(express.static(publicDir));

app.get('/api/public-config', (_req, res) => {
  const { url, anonKey } = supabaseConfig();
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ supabaseUrl: url, supabaseAnonKey: anonKey });
});

app.post('/api/careers', async (req, res) => {
  try {
    const body = req.body || {};
    const applicationData = normalizeCareersApplicationData(body);
    const { fullName, email, role } = applicationData;
    const { resumeName, resumeType, resumeBase64 } = body;

    if (!fullName || !email || !role || !resumeName || !resumeBase64) {
      return res.status(400).json({ error: 'Missing required application fields' });
    }

    if (!fileTypeAllowed(resumeType, resumeName)) {
      return res.status(400).json({ error: 'Unsupported resume file type' });
    }

    await saveCareersApplicationToSupabase({
      ...body,
      fullName,
      email,
      role,
      resumeName,
      resumeType,
      resumeBase64
    });

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Application submission failed' });
  }
});

app.get('/api/download', async (req, res) => {
  const auth = await verifySupabaseUser(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  if (req.query.platform !== 'windows') {
    return res.status(400).json({ error: 'Invalid platform' });
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.json({ url: `${r2BaseUrl}/releases/v${version}/Interview-AI-Setup-${version}-x64.exe?build=${encodeURIComponent(buildId)}` });
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Interview AI site preview: http://localhost:${PORT}`);
  console.log('This server previews the static open-source BYOK website only.');
});
