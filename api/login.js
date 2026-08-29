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
            username,
            password
        } = req.body || {};


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
            !username ||
            !password
        ) {

            return res
                .status(400)
                .json({
                    success:false,
                    message:
                        'Username and password required.'
                });
        }


        const rows =
            await sql`
                SELECT
                    id,
                    username,
                    password_hash,
                    full_name,
                    role,
                    approved,
                    active
                FROM users
                WHERE LOWER(username)
                    = ${username}
                LIMIT 1
            `;


        if (
            !rows.length
        ) {

            return res
                .status(401)
                .json({
                    success:false,
                    message:
                        'Invalid username or password.'
                });
        }


        const user =
            rows[0];


        if (
            !user.active
        ) {

            return res
                .status(403)
                .json({
                    success:false,
                    message:
                        'Account disabled.'
                });
        }


        const validPassword =
            await bcrypt.compare(
                password,
                user.password_hash
            );


        if (
            !validPassword
        ) {

            return res
                .status(401)
                .json({
                    success:false,
                    message:
                        'Invalid username or password.'
                });
        }


        if (
            !user.approved
        ) {

            return res
                .status(403)
                .json({
                    success:false,
                    status:'pending',
                    message:
                        'Waiting for administrator approval.'
                });
        }


        await sql`
            UPDATE users
            SET last_login_at =
                NOW()
            WHERE id =
                ${user.id}
        `;


        return res
            .status(200)
            .json({

                success:true,

                user:{
                    id:
                        user.id,

                    username:
                        user.username,

                    fullName:
                        user.full_name,

                    role:
                        user.role
                }
            });


    } catch(error) {

        console.error(
            'LOGIN ERROR:',
            error
        );


        return res
            .status(500)
            .json({
                success:false,
                message:
                    'Login failed.'
            });
    }
}
