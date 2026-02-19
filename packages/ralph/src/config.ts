import { str, port, bool, cleanEnv } from 'envalid';

export const configuration = () => {
    const config = cleanEnv(process.env, {
        NODE_ENV: str({
            default: 'development',
            choices: ['development', 'test', 'production'],
        }),
        PORT: port({
            default: 80,
            devDefault: 4000,
            desc: 'The port the app is running on',
        }),
        SERVICE_HOST: str({
            desc: 'The host the app is running on',
            example: 'https://api.example.com',
            default: 'http://localhost:3000',
        }),
        GENERATE_SPEC: bool({
            default: false,
            desc: 'Generates OpenAPI spec file in the docs directory and exits the application.',
        }),
        BUILD_ID: str({
            desc: 'Unique identifier generated at build time.',
            example: '1234567890',
            default: new Date().toISOString(),
        }),
        TELEGRAM_BOT_TOKEN: str({
            desc: 'The token for the Telegram bot.',
            example: '1234567890:ABC-DEF1234567890',
            default: '',
        }),
        OPENROUTER_API_KEY: str({
            desc: 'The API key for the OpenRouter API.',
            example: '1234567890',
            default: '',
        }),
        OPENROUTER_MODEL: str({
            desc: 'The model for the OpenRouter API.',
            example: 'minimax/minimax-m2.5',
            default: 'minimax/minimax-m2.5',
        }),
        RALPH_PROJECTS_DIR: str({
            desc: 'The directory for the Ralph projects.',
            example: './projects',
            default: './projects',
        }),
        ALLOWED_USERS: str({
            desc: 'The allowed users for the Telegram bot.',
            example: '1234567890,1234567891',
            default: '',
        }),
        CLAUDE_LOG_IO: bool({
            desc: 'The log IO for the Claude API.',
            example: 'true',
            default: false,
        }),
        CLAUDE_LOG_DIR: str({
            desc: 'The directory for the Claude logs.',
            example: './logs/claude',
            default: './logs/claude',
        }),
        SESSION_STORE_PATH: str({
            desc: 'The path for the session store.',
            example: './sessions.json',
            default: './sessions.json',
        }),
    });

    return {
        ...config,
        onModuleInit: false // Fix issue where nestjs checks for onModuleInit hook and fails if it doesn't exist
    };
};

export type AppConfig = ReturnType<typeof configuration>;