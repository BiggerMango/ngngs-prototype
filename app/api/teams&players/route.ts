import { NextRequest, NextResponse } from 'next/server';

import { discordFetch, fetchAllGuildMembers, DiscordUser, DiscordGuildMember, DiscordChannel, DiscordMessage } from '@/lib/discord';

import { parseMessageContent,  } from '@/lib/messageParser';


export async function GET(request: NextRequest) {
    const token = process.env.DISCORD_BOT_TOKEN;
    const guildId = process.env.DISCORD_GUILD_ID;

    if (!token || !guildId) {
        return NextResponse.json(
            { error: 'Server configuration error' },
            { status: 500 }
        );
    }

    try {
        const guildMembers = await fetchAllGuildMembers(guildId);

        const memberMap = new Map<string, DiscordGuildMember>();
        guildMembers.forEach((m) => memberMap.set(m.user.id, m));

        const channels = await discordFetch<DiscordChannel[]>(`/guilds/${guildId}/channels`);

        if (!channels || !Array.isArray(channels)) {
            return NextResponse.json(
                { error: 'Failed to retrieve channels from Discord' },
                { status: 500 }
            );
        }

        const targetChannels = channels.filter(
            (channel) =>
                channel.type === 0 &&
                channel.name?.toLowerCase().includes('orga-und-teams')
        );

        const processedChannels = [];

        for (const channel of targetChannels) {
            const gameName = channel.parent_id
                ? channels.find((parent) => parent.id === channel.parent_id)?.name || 'Unknown Game'
                : 'Unknown Game';

            if (!channel.last_message_id) continue;

            const message = await discordFetch<DiscordMessage>(
                `/channels/${channel.id}/messages/${channel.last_message_id}`
            );

            if (!message) continue;

            const parsedData = parseMessageContent(message.content, memberMap, guildId);

            processedChannels.push({
                id: channel.id,
                name: channel.name || 'Unnamed Channel',
                position: channel.position || null,
                game_name: gameName,
                message_content: message.content,
                parsed_data: parsedData,
            });
        }

        processedChannels.sort((a, b) => (a.position || 0) - (b.position || 0));

        return NextResponse.json(processedChannels, {
            headers: {
                'cache-control': 'public, max-age=1209600, s-maxage=1209600, stale-while-revalidate=86400',
            },
        });
    } catch (error) {
        console.error('Error found while fetching Discord Guild: ', error);
        return NextResponse.json(
            { error: 'Error found while fetching Discord Guild' },
            { status: 500 }
        );
    }
}
