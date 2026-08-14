

export interface DiscordUser {
    id: string;
    username: string;
    global_name?: string;
    avatar?: string;
}

export interface DiscordGuildMember {
    user: DiscordUser;
    nick?: string;
    avatar?: string;
}

export interface DiscordMessage {
    id: string;
    channel_id: string;
    content: string;
    mentions: Array<DiscordUser>;
}

export interface DiscordChannel {
    id: string;
    type: number;
    position?: number;
    name?: string;
    last_message_id?: string;
    parent_id?: string;
}




export async function discordFetch<T>(endpoint: string, maxRetries: number = 3): Promise<T | null> {
    if (maxRetries <= 0) {
        console.error(`[Discord API] Max retries reached for endpoint: ${endpoint}`);
        return null;
    }

    const response = await fetch(`https://discord.com/api/v10${endpoint}`, {
        method: 'GET',
        headers: {
            Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
            'Content-Type': 'application/json',
        },
        next: { revalidate: 60 },
    });

    if (response.status === 429) {
        const data = await response.json();
        const retryAfter = data.retry_after || 1;
        const isGlobal = data.global || false;

        console.warn(
            `[Discord API] Rate limited on ${endpoint}. ${
                isGlobal ? 'GLOBAL' : 'Route'
            } limit hit. Retrying in ${retryAfter}s...`
        );
    }

    const remaining = response.headers.get('X-RateLimit-Remaining');
    const resetAfter = response.headers.get('X-RateLimit-Reset-After');

    if (remaining !== null && parseInt(remaining, 10) <= 0 && resetAfter !== null) {
        const waitTimeSeconds = parseFloat(resetAfter);
        console.warn(
            `[Discord API] Rate limit bucket exhausted. Pausing requests for ${waitTimeSeconds}s.`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTimeSeconds * 1000));
    }

    return (await response.json()) as T;
}

export async function fetchAllGuildMembers(guildId: string): Promise<DiscordGuildMember[]> {
    let allMembers: DiscordGuildMember[] = [];
    let lastMemberId = '0';
    let hasMore = true;

    while (hasMore) {
        const chunk = await discordFetch<DiscordGuildMember[]>(
            `/guilds/${guildId}/members?limit=1000&after=${lastMemberId}`
        );

        if (!chunk || !Array.isArray(chunk) || chunk.length === 0) {
            hasMore = false;
        } else {
            allMembers = allMembers.concat(chunk);
            lastMemberId = chunk[chunk.length - 1].user.id;

            if (chunk.length < 1000) {
                hasMore = false;
            }
        }
    }

    return allMembers;
}