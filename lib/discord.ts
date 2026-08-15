

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

    try {
        const response = await fetch(`https://discord.com/api/v10${endpoint}`, {
            method: 'GET',
            headers: {
                Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json',
            },
            next: { revalidate: 60 },
        });

        // 1. BEHANDLUNG VON RATE LIMITS (HTTP 429)
        if (response.status === 429) {
            const data = await response.json();
            const retryAfter = (data.retry_after || 1) * 1000; // Sekunden in ms umrechnen

            console.warn(
                `[Discord API] Rate limit hit on ${endpoint}. Retrying in ${retryAfter / 1000}s...`
            );

            // Warten, bis das Limit abgelaufen ist
            await new Promise((resolve) => setTimeout(resolve, retryAfter));

            // Rekursiver Erneuter Versuch (Retry)
            return discordFetch<T>(endpoint, maxRetries - 1);
        }

        // 2. ANDERE FEHLERSTATUSCODES ABFANGEN (z. B. 401, 403, 404)
        if (!response.ok) {
            console.error(`[Discord API] Error ${response.status} on ${endpoint}`);
            return null;
        }

        // 3. ERFOLGSFALL: JSON parsen und zurückgeben
        return (await response.json()) as T;

    } catch (err) {
        console.error(`[Discord API] Network error on ${endpoint}:`, err);
        return null;
    }
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