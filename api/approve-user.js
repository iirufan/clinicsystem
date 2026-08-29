import sql from '../lib/db.js';


const ALLOWED_ROLES = [
    'admin',
    'doctor',
    'reception',
    'accounts'
];


export default async function handler(
    req,
    res
) {

    if (req.method !== 'POST') {

        return res
            .status(405)
            .json({
                success:false,
                message:
                    'Method not allowed'
            });
    }


    try {

        const {
            userId,
            role
        } = req.body || {};


        if (
            !userId ||
            !ALLOWED_ROLES
                .includes(role)
        ) {

            return res
                .status(400)
                .json({
                    success:false,
                    message:
                        'Invalid request.'
                });
        }


        await sql`
            UPDATE users

            SET
                role =
                    ${role},

                approved =
                    TRUE,

                approved_at =
                    NOW(),

                updated_at =
                    NOW()

            WHERE id =
                ${userId}
        `;


        return res
            .status(200)
            .json({
                success:true
            });


    } catch(error) {

        console.error(error);


        return res
            .status(500)
            .json({
                success:false,
                message:
                    'Unable to approve user.'
            });
    }
}
