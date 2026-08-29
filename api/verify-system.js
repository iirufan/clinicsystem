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

        const {
            password
        } = req.body || {};


        if (!password) {

            return res
                .status(400)
                .json({
                    success:false,
                    message:
                        'System password required'
                });
        }


        if (
            password !==
            process.env.SYSTEM_PASSWORD
        ) {

            return res
                .status(401)
                .json({
                    success:false,
                    message:
                        'Incorrect system password'
                });
        }


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
                    'Unable to verify system password'
            });
    }
}
