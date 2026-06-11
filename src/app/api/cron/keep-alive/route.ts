import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Enforce token validation in non-development environments if CRON_SECRET is configured
  if (
    process.env.NODE_ENV !== 'development' &&
    cronSecret &&
    authHeader !== `Bearer ${cronSecret}`
  ) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase environment variables are missing');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Execute a simple lightweight query to keep the Supabase database instance active.
    // store_settings is a safe bet since it contains default configs.
    const { data, error } = await supabase.from('store_settings').select('id').limit(1);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: 'Supabase ping successful',
      timestamp: new Date().toISOString(),
      data,
    });
  } catch (error: unknown) {
    console.error('Error keeping Supabase database alive:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to ping Supabase';
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
