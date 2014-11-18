"""Tornado handlers for logging into the notebook."""

# Copyright (c) IPython Development Team.
# Distributed under the terms of the Modified BSD License.

import uuid

from tornado.escape import url_escape

from IPython.lib.security import passwd_check

from ..base.handlers import IPythonHandler


class LoginHandler(IPythonHandler):
    """The basic tornado login handler
    
    authenticates with a hashed password from the configuration.
    """
    def _render(self, message=None):
        self.write(self.render_template('login.html',
                next=url_escape(self.get_argument('next', default=self.base_url)),
                message=message,
        ))

    def get(self):
        if self.current_user:
            self.redirect(self.get_argument('next', default=self.base_url))
        else:
            self._render()
    
    @property
    def hashed_password(self):
        return self.password_from_settings(self.settings)

    def post(self):
        typed_password = self.get_argument('password', default=u'')
        if self.login_available(self.settings):
            if passwd_check(self.hashed_password, typed_password):
                self.set_secure_cookie(self.cookie_name, str(uuid.uuid4()))
            else:
                self._render(message={'error': 'Invalid password'})
                return

        self.redirect(self.get_argument('next', default=self.base_url))
    
    @classmethod
    def validate_notebook_app_security(cls, notebook_app, ssl_options=None):
        if not notebook_app.ip:
            warning = "WARNING: The notebook server is listening on all IP addresses"
            if ssl_options is None:
                notebook_app.log.critical(warning + " and not using encryption. This "
                    "is not recommended.")
            if not notebook_app.password:
                notebook_app.log.critical(warning + " and not using authentication. "
                    "This is highly insecure and not recommended.")

    @staticmethod
    def password_from_settings(settings):
        """Return the hashed password from the tornado settings.
        
        If there is no configured password, an empty string will be returned.
        """
        return settings.get('password', u'')

    @classmethod
    def login_available(cls, settings):
        """Whether this LoginHandler is needed - and therefore whether the login page should be displayed."""
        return bool(cls.password_from_settings(settings))

