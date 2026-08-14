import { Redis } from '@upstash/redis';

import { NextResponse, NextRequest } from 'next/server';

import { discordFetch, fetchAllGuildMembers } from '@/lib/discord';
import { error } from 'console';



export async function GET(request: NextRequest) {
    const guildId = process.env.DISCORD_GUILD_ID;

    if (!guildId) {
        return NextResponse.json(
            { error: 'Server configuration error' },
            { status: 500 }
        );
    }
    try {
        console.log('fetching discord server members...');
        const guildMembers = await fetchAllGuildMembers(guildId);

        if (!guildMembers || guildMembers.length === 0) {
            return NextResponse.json(
                { error: 'no members or fetch unsuccessfull.' },
                { status: 400 }
            );
    }

    const redis = Redis.fromEnv();

    await redis.set('all_guild_members', guildMembers);
    await redis.set('members_last_synced', new Date().toISOString());
    await redis.set('members_count', guildMembers.length);

    console.log('successfully uploaded ${guildMembers.length} to Upstash Redis');

    return NextResponse.json({
        success: true,
        message: `${guildMembers.length} successfully uploaded to Upstash Redis.`,
        count: guildMembers.length,
        sample: guildMembers.slice(0, 1)
    });

    } catch{
        console.error('Error saving members to Upstash Redis:', error);
        return NextResponse.json(
            {error: 'error uploading to the database'},
            {status: 500}
        )
    }
}