// Serverless function for profile data operations (company brief, resume)
// Handles: get-company, save-company, delete-company, upload-resume, get-resume, delete-resume
const { createClient } = require('@supabase/supabase-js');

// Helper function to verify JWT and get user
async function verifyAuthAndGetUser(req, supabase) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('Missing or invalid authorization header');
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
        throw new Error('Invalid or expired token');
    }

    return user;
}

// Get company brief for user
async function getCompanyBrief(req, res, supabase) {
    try {
        const user = await verifyAuthAndGetUser(req, supabase);

        const { data, error } = await supabase
            .from('user_company_briefs')
            .select('*')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
            console.error('[Profile API] Error fetching company brief:', error);
            return res.status(500).json({ error: 'Failed to fetch company brief' });
        }

        return res.status(200).json({
            success: true,
            companyBrief: data || null
        });
    } catch (error) {
        console.error('[Profile API] getCompanyBrief error:', error);
        return res.status(401).json({ error: error.message });
    }
}

// Save/update company brief for user
async function saveCompanyBrief(req, res, supabase) {
    try {
        const user = await verifyAuthAndGetUser(req, supabase);
        const { name, role, website, overview, notes } = req.body;

        if (!name || !overview) {
            return res.status(400).json({ error: 'Company name and overview are required' });
        }

        // Check if user already has a company brief
        const { data: existing } = await supabase
            .from('user_company_briefs')
            .select('id')
            .eq('user_id', user.id)
            .limit(1)
            .single();

        const briefData = {
            user_id: user.id,
            company_name: name.trim(),
            company_role: role?.trim() || null,
            company_website: website?.trim() || null,
            company_overview: overview.trim(),
            company_notes: notes?.trim() || null,
            updated_at: new Date().toISOString()
        };

        let result;
        if (existing) {
            // Update existing
            result = await supabase
                .from('user_company_briefs')
                .update(briefData)
                .eq('id', existing.id)
                .select()
                .single();
        } else {
            // Insert new
            briefData.created_at = new Date().toISOString();
            result = await supabase
                .from('user_company_briefs')
                .insert(briefData)
                .select()
                .single();
        }

        if (result.error) {
            console.error('[Profile API] Error saving company brief:', result.error);
            return res.status(500).json({ error: 'Failed to save company brief' });
        }

        return res.status(200).json({
            success: true,
            message: 'Company brief saved successfully',
            companyBrief: result.data
        });
    } catch (error) {
        console.error('[Profile API] saveCompanyBrief error:', error);
        return res.status(401).json({ error: error.message });
    }
}

// Delete company brief for user
async function deleteCompanyBrief(req, res, supabase) {
    try {
        const user = await verifyAuthAndGetUser(req, supabase);

        const { error } = await supabase
            .from('user_company_briefs')
            .delete()
            .eq('user_id', user.id);

        if (error) {
            console.error('[Profile API] Error deleting company brief:', error);
            return res.status(500).json({ error: 'Failed to delete company brief' });
        }

        return res.status(200).json({
            success: true,
            message: 'Company brief deleted successfully'
        });
    } catch (error) {
        console.error('[Profile API] deleteCompanyBrief error:', error);
        return res.status(401).json({ error: error.message });
    }
}

// Get resume metadata for user
async function getResume(req, res, supabase) {
    try {
        const user = await verifyAuthAndGetUser(req, supabase);

        const { data, error } = await supabase
            .from('user_resumes')
            .select('id, user_id, file_name, file_type, file_size, uploaded_at, text_content')
            .eq('user_id', user.id)
            .order('uploaded_at', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('[Profile API] Error fetching resume:', error);
            return res.status(500).json({ error: 'Failed to fetch resume' });
        }

        return res.status(200).json({
            success: true,
            resume: data || null
        });
    } catch (error) {
        console.error('[Profile API] getResume error:', error);
        return res.status(401).json({ error: error.message });
    }
}

// Upload/update resume for user
async function uploadResume(req, res, supabase) {
    try {
        const user = await verifyAuthAndGetUser(req, supabase);
        const { fileName, fileType, fileSize, fileContent, textContent } = req.body;

        if (!fileName || !fileContent) {
            return res.status(400).json({ error: 'File name and content are required' });
        }

        // Validate file size (10MB max)
        if (fileSize > 10 * 1024 * 1024) {
            return res.status(400).json({ error: 'File size exceeds 10MB limit' });
        }

        // Delete existing resume if any
        await supabase
            .from('user_resumes')
            .delete()
            .eq('user_id', user.id);

        // Insert new resume
        const resumeData = {
            user_id: user.id,
            file_name: fileName,
            file_type: fileType || 'application/octet-stream',
            file_size: fileSize || 0,
            file_content: fileContent, // Base64 encoded
            text_content: textContent || null, // Extracted text for AI context
            uploaded_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('user_resumes')
            .insert(resumeData)
            .select('id, user_id, file_name, file_type, file_size, uploaded_at')
            .single();

        if (error) {
            console.error('[Profile API] Error uploading resume:', error);
            return res.status(500).json({ error: 'Failed to upload resume' });
        }

        return res.status(200).json({
            success: true,
            message: 'Resume uploaded successfully',
            resume: data
        });
    } catch (error) {
        console.error('[Profile API] uploadResume error:', error);
        return res.status(401).json({ error: error.message });
    }
}

// Delete resume for user
async function deleteResume(req, res, supabase) {
    try {
        const user = await verifyAuthAndGetUser(req, supabase);

        const { error } = await supabase
            .from('user_resumes')
            .delete()
            .eq('user_id', user.id);

        if (error) {
            console.error('[Profile API] Error deleting resume:', error);
            return res.status(500).json({ error: 'Failed to delete resume' });
        }

        return res.status(200).json({
            success: true,
            message: 'Resume deleted successfully'
        });
    } catch (error) {
        console.error('[Profile API] deleteResume error:', error);
        return res.status(401).json({ error: error.message });
    }
}

// Get resume content (for viewing/downloading)
async function getResumeContent(req, res, supabase) {
    try {
        const user = await verifyAuthAndGetUser(req, supabase);

        const { data, error } = await supabase
            .from('user_resumes')
            .select('file_name, file_type, file_content')
            .eq('user_id', user.id)
            .limit(1)
            .single();

        if (error) {
            console.error('[Profile API] Error fetching resume content:', error);
            return res.status(404).json({ error: 'Resume not found' });
        }

        return res.status(200).json({
            success: true,
            fileName: data.file_name,
            fileType: data.file_type,
            fileContent: data.file_content
        });
    } catch (error) {
        console.error('[Profile API] getResumeContent error:', error);
        return res.status(401).json({ error: error.message });
    }
}

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // Initialize Supabase client
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('[Profile API] Missing Supabase environment variables');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Route based on action parameter
        const action = req.query.action || req.body?.action;
        console.log('[Profile API] Received request - Method:', req.method, 'Action:', action);

        switch (action) {
            case 'get-company':
                await getCompanyBrief(req, res, supabase);
                break;
            
            case 'save-company':
                await saveCompanyBrief(req, res, supabase);
                break;
            
            case 'delete-company':
                await deleteCompanyBrief(req, res, supabase);
                break;
            
            case 'get-resume':
                await getResume(req, res, supabase);
                break;
            
            case 'upload-resume':
                await uploadResume(req, res, supabase);
                break;
            
            case 'delete-resume':
                await deleteResume(req, res, supabase);
                break;
            
            case 'get-resume-content':
                await getResumeContent(req, res, supabase);
                break;
            
            default:
                res.status(400).json({ 
                    error: 'Invalid action. Use: get-company, save-company, delete-company, get-resume, upload-resume, delete-resume, get-resume-content' 
                });
        }
    } catch (error) {
        console.error('[Profile API] Unhandled error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};
