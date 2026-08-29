import sql from '../lib/db.js';
import bcrypt from 'bcryptjs';


export default async function handler(
    req,
    res
) {

    if (req.method !== 'POST') {

        return res
            .status(405)
            .json({
                success:false,
                message:'Method not allowed'
            });
    }


    try {

        let {
            fullName,
            username,
            password
        } = req.body || {};


        fullName =
            String(
                fullName || ''
            ).trim();


        username =
            String(
                username || ''
            )
            .trim()
            .toLowerCase();


        password =
            String(
                password || ''
            );


        if (
            !fullName ||
            !username ||
            !password
        ) {

            return res
                .status(400)
                .json({
                    success:false,
                    message:
                        'All fields are required.'
                });
        }


        if (
            username.length < 3
        ) {

            return res
                .status(400)
                .json({
                    success:false,
                    message:
                        'Username too short.'
                });
        }


        if (
            password.length < 6
        ) {

            return res
                .status(400)
                .json({
                    success:false,
                    message:
                        'Password must contain at least 6 characters.'
                });
        }


        const existing =
            await sql`
                SELECT id
                FROM users
                WHERE LOWER(username)
                    = ${username}
                LIMIT 1
            `;


        if (
            existing.length
        ) {

            return res
                .status(409)
                .json({
                    success:false,
                    message:
                        'Username already exists.'
                });
        }


        const passwordHash =
            await bcrypt.hash(
                password,
                12
            );


        await sql`
            INSERT INTO users (
                username,
                password_hash,
                full_name,
                role,
                approved,
                active
            )
            VALUES (
                ${username},
                ${passwordHash},
                ${fullName},
                'reception',
                FALSE,
                TRUE
            )
        `;


        return res
            .status(201)
            .json({
                success:true,
                message:
                    'Account created and waiting for approval.'
            });


    } catch(error) {

        console.error(
            'REGISTER ERROR:',
            error
        );


        return res
            .status(500)
            .json({
                success:false,
                message:
                    'Unable to create account.'
            });
    }
}
