import sql from '../lib/db.js';


export default async function handler(
    req,
    res
) {

    try {

        const users =
            await sql`
                SELECT
                    id,
                    username,
                    full_name,
                    role,
                    approved,
                    active,
                    created_at,
                    last_login_at
                FROM users
                ORDER BY
                    approved ASC,
                    created_at DESC
            `;


        return res
            .status(200)
            .json({
                success:true,
                users
            });


    } catch(error) {

        console.error(error);


        return res
            .status(500)
            .json({
                success:false,
                message:
                    'Unable to load users.'
            });
    }
}
